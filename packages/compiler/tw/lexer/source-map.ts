/**
 * Source Map generation with VLQ (Variable Length Quantity) encoding.
 *
 * Source maps let debuggers map generated output back to original .tw source.
 * Next.js generates source maps via Webpack/Turbopack. TW generates them
 * directly in the codegen phase -- no separate tool needed.
 *
 * VLQ encoding: Base64-encoded variable-length integers.
 * Each segment in the mappings string is: [genCol, sourceIdx, srcLine, srcCol, nameIdx?]
 * All values are relative to the previous segment.
 *
 * Standard: https://sourcemaps.info/spec.html (Source Map v3)
 */

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map<string, number>();
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP.set(BASE64_CHARS[i], i);
}

export interface SourceMapEntry {
  generatedLine: number;
  generatedCol: number;
  sourceLine: number;
  sourceCol: number;
  sourceFile?: string;
  name?: string;
}

export class SourceMapBuilder {
  private entries: SourceMapEntry[] = [];
  private sources: string[] = [];
  private sourceIndices: Map<string, number> = new Map();
  private names: string[] = [];
  private nameIndices: Map<string, number> = new Map();

  /**
   * Add a mapping entry.
   * generatedLine/generatedCol: position in generated output (HTML/CSS/JS)
   * sourceLine/sourceCol: position in original .tw source
   */
  add(entry: SourceMapEntry): void {
    // Track source file
    if (entry.sourceFile && !this.sourceIndices.has(entry.sourceFile)) {
      this.sourceIndices.set(entry.sourceFile, this.sources.length);
      this.sources.push(entry.sourceFile);
    }

    // Track name
    if (entry.name && !this.nameIndices.has(entry.name)) {
      this.nameIndices.set(entry.name, this.names.length);
      this.names.push(entry.name);
    }

    this.entries.push(entry);
  }

  /**
   * Add a batch of entries -- faster than calling add() in a loop.
   */
  addBatch(entries: SourceMapEntry[]): void {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  /**
   * Generate the source map as a JSON object (v3 format).
   */
  toJSON(): {
    version: 3;
    file?: string;
    sourceRoot?: string;
    sources: string[];
    sourcesContent?: (string | null)[];
    names: string[];
    mappings: string;
  } {
    return {
      version: 3,
      sources: [...this.sources],
      sourcesContent: this.sources.map(() => null),
      names: [...this.names],
      mappings: this.encodeMappings(),
    };
  }

  /**
   * Generate the source map as a JSON string.
   */
  toString(file?: string): string {
    const json = this.toJSON();
    if (file) json.file = file;
    return JSON.stringify(json);
  }

  /**
   * Encode all entries into the VLQ mappings string.
   *
   * Format: segments separated by commas, lines separated by semicolons.
   * Each segment: 1-5 VLQ-encoded values (genCol, sourceIdx, srcLine, srcCol, nameIdx).
   */
  private encodeMappings(): string {
    if (this.entries.length === 0) return "";

    // Sort by generated line, then by generated column
    const sorted = [...this.entries].sort((a, b) => {
      if (a.generatedLine !== b.generatedLine) return a.generatedLine - b.generatedLine;
      return a.generatedCol - b.generatedCol;
    });

    const lines: string[][] = [[]];
    let currentLine = 0;

    let prevGenCol = 0;
    let prevSourceIdx = 0;
    let prevSrcLine = 0;
    let prevSrcCol = 0;
    let prevNameIdx = 0;

    for (const entry of sorted) {
      // Advance lines if needed
      while (currentLine < entry.generatedLine - 1) {
        lines.push([]);
        currentLine++;
      }
      if (currentLine < entry.generatedLine) {
        lines.push([]);
        currentLine = entry.generatedLine;
        prevGenCol = 0; // Reset column at start of new line
      }

      const segment: number[] = [];

      // Field 1: generated column (always present, relative to prev in same line)
      const genColDelta = entry.generatedCol - prevGenCol;
      segment.push(genColDelta);
      prevGenCol = entry.generatedCol;

      // Field 2-4: source index, source line, source col (if source present)
      if (entry.sourceFile) {
        const srcIdx = this.sourceIndices.get(entry.sourceFile)!;
        segment.push(srcIdx - prevSourceIdx);
        segment.push(entry.sourceLine - prevSrcLine);
        segment.push(entry.sourceCol - prevSrcCol);
        prevSourceIdx = srcIdx;
        prevSrcLine = entry.sourceLine;
        prevSrcCol = entry.sourceCol;

        // Field 5: name index (if name present)
        if (entry.name) {
          const nameIdx = this.nameIndices.get(entry.name)!;
          segment.push(nameIdx - prevNameIdx);
          prevNameIdx = nameIdx;
        }
      }

      const encoded = segment.map(encodeVLQ).join(",");
      lines[currentLine].push(encoded);
    }

    return lines.map((segs) => segs.join(",")).join(";");
  }

  /**
   * Get stats about the source map.
   */
  getStats(): { entries: number; sources: number; names: number; mappingSize: number } {
    return {
      entries: this.entries.length,
      sources: this.sources.length,
      names: this.names.length,
      mappingSize: this.encodeMappings().length,
    };
  }

  /**
   * Clear all entries (for reuse).
   */
  clear(): void {
    this.entries = [];
    this.sources = [];
    this.sourceIndices.clear();
    this.names = [];
    this.nameIndices.clear();
  }
}

/**
 * Encode a signed integer as a Base64 VLQ string.
 *
 * VLQ encoding:
 * 1. Take the absolute value
 * 2. Shift left by 1, set lowest bit to sign (0=positive, 1=negative)
 * 3. Take 5 bits at a time, MSB first
 * 4. High bit of each 5-bit group = continuation flag
 */
export function encodeVLQ(value: number): string {
  let result = "";

  // Convert to VLQ value (sign in lowest bit)
  let vlq = value < 0 ? ((-value << 1) | 1) : (value << 1);

  do {
    // Take lowest 5 bits
    let digit = vlq & 0x1f;
    vlq >>= 5;

    // If there are more digits, set continuation bit
    if (vlq > 0) {
      digit |= 0x20;
    }

    result += BASE64_CHARS[digit];
  } while (vlq > 0);

  return result;
}

/**
 * Decode a Base64 VLQ string to a signed integer.
 */
export function decodeVLQ(str: string, start: number = 0): { value: number; length: number } {
  let value = 0;
  let shift = 0;
  let pos = start;
  let continuation: boolean;

  do {
    const ch = str[pos];
    const digit = BASE64_LOOKUP.get(ch);
    if (digit === undefined) break;

    continuation = (digit & 0x20) !== 0;
    value += (digit & 0x1f) << shift;
    shift += 5;
    pos++;
  } while (continuation);

  // Extract sign and magnitude
  const negative = (value & 1) !== 0;
  const magnitude = value >> 1;

  return {
    value: negative ? -magnitude : magnitude,
    length: pos - start,
  };
}

/**
 * Decode an entire mappings string into entry array.
 * Useful for merging source maps or debugging.
 */
export function decodeMappings(mappings: string): Array<{
  genLine: number;
  genCol: number;
  sourceIdx?: number;
  sourceLine?: number;
  sourceCol?: number;
  nameIdx?: number;
}> {
  const result: Array<{
    genLine: number;
    genCol: number;
    sourceIdx?: number;
    sourceLine?: number;
    sourceCol?: number;
    nameIdx?: number;
  }> = [];

  const lines = mappings.split(";");

  let prevGenCol = 0;
  let prevSourceIdx = 0;
  let prevSourceLine = 0;
  let prevSourceCol = 0;
  let prevNameIdx = 0;

  for (let line = 0; line < lines.length; line++) {
    const segments = lines[line].split(",");
    prevGenCol = 0; // Reset at start of each line

    for (const seg of segments) {
      if (!seg) continue;

      const fields: number[] = [];
      let pos = 0;
      while (pos < seg.length) {
        const { value, length } = decodeVLQ(seg, pos);
        fields.push(value);
        pos += length;
      }

      if (fields.length === 0) continue;

      prevGenCol += fields[0];
      const entry: any = { genLine: line + 1, genCol: prevGenCol };

      if (fields.length >= 4) {
        prevSourceIdx += fields[1];
        prevSourceLine += fields[2];
        prevSourceCol += fields[3];
        entry.sourceIdx = prevSourceIdx;
        entry.sourceLine = prevSourceLine;
        entry.sourceCol = prevSourceCol;
      }

      if (fields.length >= 5) {
        prevNameIdx += fields[4];
        entry.nameIdx = prevNameIdx;
      }

      result.push(entry);
    }
  }

  return result;
}

/**
 * Merge two source maps (chain them).
 * Used when output goes through multiple transformation steps.
 */
export function mergeSourceMaps(
  upstream: { sources: string[]; names: string[]; mappings: string },
  downstream: { sources: string[]; names: string[]; mappings: string }
): { sources: string[]; names: string[]; mappings: string } {
  const downEntries = decodeMappings(downstream.mappings);
  const builder = new SourceMapBuilder();

  for (const entry of downEntries) {
    if (entry.sourceIdx !== undefined && entry.sourceLine !== undefined && entry.sourceCol !== undefined) {
      // Look up in upstream
      const upstreamEntries = decodeMappings(upstream.mappings);
      // Find matching upstream entry by source line/col
      const upstreamMatch = upstreamEntries.find(
        (u) => u.genLine === entry.sourceLine! && u.genCol === entry.sourceCol!
      );

      if (upstreamMatch && upstreamMatch.sourceIdx !== undefined) {
        builder.add({
          generatedLine: entry.genLine,
          generatedCol: entry.genCol,
          sourceLine: upstreamMatch.sourceLine!,
          sourceCol: upstreamMatch.sourceCol!,
          sourceFile: upstream.sources[upstreamMatch.sourceIdx],
          name: entry.nameIdx !== undefined ? downstream.names[entry.nameIdx] : undefined,
        });
      }
    }
  }

  return builder.toJSON();
}
