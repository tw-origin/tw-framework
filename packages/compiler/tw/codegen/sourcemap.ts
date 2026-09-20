/**
 * Source map generator for codegen -- VLQ source map v3.
 *
 * Generates source maps that map generated HTML/CSS/JS back to
 * the original TW source files. This enables:
 * - Debugging in browser DevTools (see original .tw files)
 * - Stack traces with original source locations
 * - LSP error reporting with accurate positions
 *
 * Source map format (v3):
 *   {
 *     version: 3,
 *     sources: ["app.tw"],
 *     sourcesContent: ["<original source>"],
 *     mappings: "AAAA,CAAC,CAAC,...",  // VLQ encoded
 *     names: ["var1", "func1"],
 *     file: "app.js"
 *   }
 *
 * VLQ (Variable Length Quantity) encoding:
 *   Each mapping segment is a comma-separated list of fields:
 *   1. Generated column (relative to previous)
 *   2. Source file index (relative to previous)
 *   Base64 VLQ: 6 bits per character, continuation bit
 *
 * Performance: We build mappings incrementally during codegen,
 * so there's no extra pass over the output.
 */

// --- Source Map Builder -----------------------------------------------

export interface SourceMapMapping {
  /** Generated line (0-based) */
  generatedLine: number;
  /** Generated column (0-based) */
  generatedColumn: number;
  /** Source file index */
  sourceIndex: number;
  /** Original line (0-based) */
  originalLine: number;
  /** Original column (0-based) */
  originalColumn: number;
  /** Name index (optional) */
  nameIndex?: number;
}

export interface SourceMap {
  version: 3;
  sources: string[];
  sourcesContent: string[];
  mappings: string;
  names: string[];
  file?: string;
}

export class SourceMapBuilder {
  private mappings: SourceMapMapping[] = [];
  private sources: string[] = [];
  private sourcesContent: string[] = [];
  private names: string[] = [];
  private sourceIndex = new Map<string, number>();
  private nameIndex = new Map<string, number>();

  /**
   * Register a source file.
   */
  addSource(file: string, content?: string): number {
    let idx = this.sourceIndex.get(file);
    if (idx === undefined) {
      idx = this.sources.length;
      this.sources.push(file);
      this.sourcesContent.push(content ?? "");
      this.sourceIndex.set(file, idx);
    }
    return idx;
  }

  /**
   * Register a name (variable, function).
   */
  addName(name: string): number {
    let idx = this.nameIndex.get(name);
    if (idx === undefined) {
      idx = this.names.length;
      this.names.push(name);
      this.nameIndex.set(name, idx);
    }
    return idx;
  }

  /**
   * Add a mapping from generated code to original source.
   */
  addMapping(mapping: SourceMapMapping): void {
    this.mappings.push(mapping);
  }

  /**
   * Add a simple mapping (generated position -> source position).
   */
  map(
    genLine: number, genCol: number,
    srcFile: string, srcLine: number, srcCol: number,
    name?: string
  ): void {
    const sourceIndex = this.addSource(srcFile);
    const mapping: SourceMapMapping = {
      generatedLine: genLine,
      generatedColumn: genCol,
      sourceIndex,
      originalLine: srcLine,
      originalColumn: srcCol,
    };

    if (name) {
      mapping.nameIndex = this.addName(name);
    }

    this.mappings.push(mapping);
  }

  /**
   * Generate the source map object.
   */
  build(file?: string): SourceMap {
    return {
      version: 3,
      sources: [...this.sources],
      sourcesContent: [...this.sourcesContent],
      mappings: this.encodeMappings(),
      names: [...this.names],
      file,
    };
  }

  /**
   * Generate source map as JSON string.
   */
  toJSON(file?: string): string {
    return JSON.stringify(this.build(file));
  }

  /**
   * Generate source map with inline data URL.
   * Usage: `//# sourceMappingURL=data:application/json;base64,...`
   */
  toInlineDataURL(): string {
    const json = this.toJSON();
    const b64 = btoa(json);
    return `//# sourceMappingURL=data:application/json;base64,${b64}`;
  }

  // --- VLQ Encoding --------------------------------------------------

  /**
   * Encode all mappings into the VLQ source map format.
   *
   * Format: segments separated by ;, fields separated by ,
   * Each line starts with a new ; in the mappings string.
   */
  private encodeMappings(): string {
    if (this.mappings.length === 0) return "";

    // Sort mappings by generated line, then column
    const sorted = [...this.mappings].sort((a, b) => {
      if (a.generatedLine !== b.generatedLine) return a.generatedLine - b.generatedLine;
      return a.generatedColumn - b.generatedColumn;
    });

    const lines: string[] = [];
    let currentLine = 0;
    let prevGenCol = 0;
    let prevSrcIdx = 0;
    let prevSrcLine = 0;
    let prevSrcCol = 0;
    let prevNameIdx = 0;

    for (const mapping of sorted) {
      // Fill empty lines
      while (currentLine < mapping.generatedLine) {
        lines.push("");
        currentLine++;
        prevGenCol = 0; // Reset column on new line
      }

      // Start a new line array if needed
      if (lines.length === 0 || currentLine >= lines.length) {
        lines.push("");
      }

      const segment: number[] = [];

      // Field 1: Generated column (relative to previous segment on same line)
      segment.push(mapping.generatedColumn - prevGenCol);
      prevGenCol = mapping.generatedColumn;

      // Field 2: Source file index (relative)
      segment.push(mapping.sourceIndex - prevSrcIdx);
      prevSrcIdx = mapping.sourceIndex;

      // Field 3: Original line (relative)
      segment.push(mapping.originalLine - prevSrcLine);
      prevSrcLine = mapping.originalLine;

      // Field 4: Original column (relative)
      segment.push(mapping.originalColumn - prevSrcCol);
      prevSrcCol = mapping.originalColumn;

      // Field 5: Name index (optional, relative)
      if (mapping.nameIndex !== undefined) {
        segment.push(mapping.nameIndex - prevNameIdx);
        prevNameIdx = mapping.nameIndex;
      }

      // Encode segment as VLQ
      const encoded = segment.map(v => this.encodeVLQ(v)).join("");

      // Append to current line
      if (lines[currentLine].length > 0) {
        lines[currentLine] += ",";
      }
      lines[currentLine] += encoded;
    }

    return lines.join(";");
  }

  /**
   * Encode a value as Base64 VLQ.
   *
   * VLQ encoding:
   * - Sign bit in lowest bit (0 = positive, 1 = negative)
   * - 5 data bits per group
   * - Continuation bit in highest bit (1 = more groups)
   */
  private encodeVLQ(value: number): string {
    const VLQ_BASE_SHIFT = 5;
    const VLQ_BASE = 1 << VLQ_BASE_SHIFT; // 32
    const VLQ_BASE_MASK = VLQ_BASE - 1;    // 31
    const VLQ_CONTINUATION_BIT = VLQ_BASE; // 32

    const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    // Add sign bit
    let vlq = value < 0 ? ((-value << 1) | 1) : (value << 1);

    let result = "";
    do {
      let digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        digit |= VLQ_CONTINUATION_BIT;
      }
      result += BASE64_CHARS[digit];
    } while (vlq > 0);

    return result;
  }

  // --- VLQ Decoding (for merging source maps) ------------------------

  /**
   * Decode a VLQ value from a Base64 string.
   */
  private decodeVLQ(str: string, offset: number): { value: number; nextOffset: number } {
    const VLQ_BASE_SHIFT = 5;
    const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
    const VLQ_BASE_MASK = VLQ_BASE - 1;
    const VLQ_CONTINUATION_BIT = VLQ_BASE;

    const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const DECODE_MAP = new Map<string, number>();
    for (let i = 0; i < BASE64_CHARS.length; i++) {
      DECODE_MAP.set(BASE64_CHARS[i], i);
    }

    let result = 0;
    let shift = 0;
    let continuation = false;

    do {
      const ch = str[offset++];
      const digit = DECODE_MAP.get(ch) ?? 0;
      continuation = (digit & VLQ_CONTINUATION_BIT) !== 0;
      result += (digit & VLQ_BASE_MASK) << shift;
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    // Extract sign and value
    const negate = (result & 1) !== 0;
    result >>= 1;

    return { value: negate ? -result : result, nextOffset: offset };
  }

  // --- Source Map Merging ---------------------------------------------

  /**
   * Merge two source maps (for multi-stage compilation).
   *
   * Stage 1: .tw -> intermediate.js (map1)
   * Stage 2: intermediate.js -> final.js (map2)
   *
   * Merged: .tw -> final.js
   */
  merge(map1: SourceMap, map2: SourceMap): SourceMap {
    // Decode map2's mappings to find which map1 entries they reference
    // Then follow back to map1's original sources
    const merged = new SourceMapBuilder();

    // Use map1's sources (they point to original .tw files)
    for (let i = 0; i < map1.sources.length; i++) {
      merged.addSource(map1.sources[i], map1.sourcesContent[i]);
    }
    for (const name of map1.names) {
      merged.addName(name);
    }

    // Decode map2 mappings and follow to map1
    const map2Mappings = this.decodeMappings(map2.mappings);

    for (const m2 of map2Mappings) {
      if (m2.sourceIndex === undefined || m2.sourceIndex >= map1.mappings.length / 5) {
        // Can't trace -- add mapping to generated only
        continue;
      }

      // Find the corresponding mapping in map1
      // This is a simplification -- real merging requires position matching
      const m1Mappings = this.decodeMappings(map1.mappings);
      let bestMatch: SourceMapMapping | null = null;
      let bestDist = Infinity;

      for (const m1 of m1Mappings) {
        if (m1.generatedLine === m2.originalLine && m1.generatedColumn === m2.originalColumn) {
          bestMatch = m1;
          break;
        }
        const dist = Math.abs(m1.generatedLine - m2.originalLine) * 1000 + Math.abs(m1.generatedColumn - m2.originalColumn);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = m1;
        }
      }

      if (bestMatch) {
        merged.addMapping({
          generatedLine: m2.generatedLine,
          generatedColumn: m2.generatedColumn,
          sourceIndex: bestMatch.sourceIndex,
          originalLine: bestMatch.originalLine,
          originalColumn: bestMatch.originalColumn,
          nameIndex: bestMatch.nameIndex,
        });
      }
    }

    return merged.build();
  }

  /**
   * Decode a mappings string into individual mappings.
   */
  private decodeMappings(mappings: string): SourceMapMapping[] {
    const result: SourceMapMapping[] = [];
    const lines = mappings.split(";");

    let prevGenCol = 0;
    let prevSrcIdx = 0;
    let prevSrcLine = 0;
    let prevSrcCol = 0;
    let prevNameIdx = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      prevGenCol = 0; // Reset column on new line

      if (!line) continue;

      const segments = line.split(",");
      for (const seg of segments) {
        if (!seg) continue;

        let offset = 0;

        // Field 1: Generated column
        const { value: genCol, nextOffset: o1 } = this.decodeVLQ(seg, offset);
        offset = o1;
        prevGenCol += genCol;

        if (offset >= seg.length) {
          // Only generated column -- no source info
          continue;
        }

        // Field 2: Source index
        const { value: srcIdx, nextOffset: o2 } = this.decodeVLQ(seg, offset);
        offset = o2;
        prevSrcIdx += srcIdx;

        // Field 3: Original line
        const { value: srcLine, nextOffset: o3 } = this.decodeVLQ(seg, offset);
        offset = o3;
        prevSrcLine += srcLine;

        // Field 4: Original column
        const { value: srcCol, nextOffset: o4 } = this.decodeVLQ(seg, offset);
        offset = o4;
        prevSrcCol += srcCol;

        const mapping: SourceMapMapping = {
          generatedLine: lineNum,
          generatedColumn: prevGenCol,
          sourceIndex: prevSrcIdx,
          originalLine: prevSrcLine,
          originalColumn: prevSrcCol,
        };

        // Field 5: Name index (optional)
        if (offset < seg.length) {
          const { value: nameIdx } = this.decodeVLQ(seg, offset);
          prevNameIdx += nameIdx;
          mapping.nameIndex = prevNameIdx;
        }

        result.push(mapping);
      }
    }

    return result;
  }
}

// --- Public API ------------------------------------------------------

/**
 * Create a new source map builder.
 */
export function createSourceMapBuilder(): SourceMapBuilder {
  return new SourceMapBuilder();
}

/**
 * Generate source map for a codegen pass.
 */
export function generateSourceMap(
  generatedCode: string,
  sourceFile: string,
  sourceContent: string
): SourceMap {
  const builder = new SourceMapBuilder();
  builder.addSource(sourceFile, sourceContent);

  // Generate basic mappings (line-by-line)
  const genLines = generatedCode.split("\n");
  for (let i = 0; i < genLines.length; i++) {
    builder.addMapping({
      generatedLine: i,
      generatedColumn: 0,
      sourceIndex: 0,
      originalLine: i,
      originalColumn: 0,
    });
  }

  return builder.build();
}
