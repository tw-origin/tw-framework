/**
 * Block matching -- inline scripts, twm blocks, nested braces, comment handling.
 * Handles raw text content inside <script>, <style>, and twm blocks.
 */

import { RAW_TEXT_TAGS } from "@tw/shared";

export interface BlockReadResult {
  type: "script" | "style" | "twm" | "comment" | "cdata" | "doctype" | "raw";
  content: string;
  raw: string;
  start: number;
  end: number;
  attrs?: string;
  lang?: string;
  module?: boolean;
  error?: string;
}

// --- Read Script Block -----------------------------------------------------

export function readScriptBlock(source: string, start: number): BlockReadResult {
  // source[start] should be at '<' of <script>
  let i = start;

  // Skip <script
  const scriptTag = source.slice(i, i + 7).toLowerCase();
  if (scriptTag !== "<script") {
    return { type: "script", content: "", raw: "", start, end: i, error: "Expected <script>" };
  }

  i += 7;

  // Read attributes
  let attrs = "";
  while (i < source.length && source[i] !== ">") {
    attrs += source[i];
    i++;
  }

  if (source[i] !== ">") {
    return { type: "script", content: "", raw: source.slice(start, i), start, end: i, error: "Unclosed <script> tag" };
  }

  i++; // skip >

  // Parse attributes
  const isModule = /type\s*=\s*["']module["']/i.test(attrs);
  const langMatch = attrs?.match(/lang\s*=\s*["']([^"']+)["']/i);
  const lang = langMatch?.[1] ?? "javascript";

  // Find </script>
  const closeIdx = findClosingTag(source, i, "</script");
  if (closeIdx === -1) {
    return {
      type: "script",
      content: source.slice(i),
      raw: source.slice(start),
      start,
      end: source.length,
      attrs,
      lang,
      module: isModule,
      error: "Unclosed <script> block",
    };
  }

  let content = source.slice(i, closeIdx);
  const end = findTagEnd(source, closeIdx);

  return {
    type: "script",
    content,
    raw: source.slice(start, end),
    start,
    end,
    attrs,
    lang,
    module: isModule,
  };
}

// --- Read Style Block -------------------------------------------------------

export function readStyleBlock(source: string, start: number): BlockReadResult {
  let i = start;
  const styleTag = source.slice(i, i + 6).toLowerCase();
  if (styleTag !== "<style") {
    return { type: "style", content: "", raw: "", start, end: i, error: "Expected <style>" };
  }

  i += 6;

  let attrs = "";
  while (i < source.length && source[i] !== ">") {
    attrs += source[i];
    i++;
  }

  if (source[i] !== ">") {
    return { type: "style", content: "", raw: source.slice(start, i), start, end: i, error: "Unclosed <style> tag" };
  }

  i++;

  const langMatch = attrs?.match(/lang\s*=\s*["']([^"']+)["']/i);
  const lang = langMatch?.[1] ?? "css";
  const scoped = /\bscoped\b/i.test(attrs);

  const closeIdx = findClosingTag(source, i, "</style");
  if (closeIdx === -1) {
    return {
      type: "style",
      content: source.slice(i),
      raw: source.slice(start),
      start,
      end: source.length,
      attrs,
      lang,
      error: "Unclosed <style> block",
    };
  }

  const content = source.slice(i, closeIdx);
  const end = findTagEnd(source, closeIdx);

  return {
    type: "style",
    content,
    raw: source.slice(start, end),
    start,
    end,
    attrs: scoped ? `${attrs} scoped` : attrs,
    lang,
  };
}

// --- Read TWM Block ---------------------------------------------------------

export function readTwmBlock(source: string, start: number): BlockReadResult {
  // TWM blocks are delimited by {% ... %} or {{ ... }}
  let i = start;
  let depth = 0;
  let content = "";

  // Determine delimiter type
  const isOpen = (ch: string, next: string) => {
    if (ch === "{" && next === "%") return "twm";
    if (ch === "{" && next === "{") return "interpolate";
    return null;
  };

  const openType = isOpen(source[i], source[i + 1]);
  if (!openType) {
    return { type: "twm", content: "", raw: "", start, end: i, error: "Expected {%% or {{ }}" };
  }

  const closeTag = openType === "twm" ? "%}" : "}}";
  i += 2;

  // Find closing delimiter (handle nesting)
  while (i < source.length) {
    if (source.slice(i, i + 2) === closeTag) {
      return {
        type: "twm",
        content,
        raw: source.slice(start, i + 2),
        start,
        end: i + 2,
      };
    }

    // Handle nested braces
    if (source[i] === "{") {
      depth++;
    } else if (source[i] === "}") {
      if (depth > 0) depth--;
    }

    content += source[i];
    i++;
  }

  return {
    type: "twm",
    content,
    raw: source.slice(start, i),
    start,
    end: i,
    error: "Unclosed TWM block",
  };
}

// --- Read Comment ------------------------------------------------------------

export function readComment(source: string, start: number): BlockReadResult {
  // <!-- ... -->
  if (source.slice(start, start + 4) !== "<!--") {
    return { type: "comment", content: "", raw: "", start, end: start, error: "Expected <!--" };
  }

  const closeIdx = source.indexOf("-->", start + 4);
  if (closeIdx === -1) {
    return {
      type: "comment",
      content: source.slice(start + 4),
      raw: source.slice(start),
      start,
      end: source.length,
      error: "Unclosed comment",
    };
  }

  const content = source.slice(start + 4, closeIdx);
  return {
    type: "comment",
    content,
    raw: source.slice(start, closeIdx + 3),
    start,
    end: closeIdx + 3,
  };
}

// --- Read CDATA -------------------------------------------------------------

export function readCDATA(source: string, start: number): BlockReadResult {
  if (source.slice(start, start + 9) !== "<![CDATA[") {
    return { type: "cdata", content: "", raw: "", start, end: start, error: "Expected <![CDATA[" };
  }

  const closeIdx = source.indexOf("]]>", start + 9);
  if (closeIdx === -1) {
    return {
      type: "cdata",
      content: source.slice(start + 9),
      raw: source.slice(start),
      start,
      end: source.length,
      error: "Unclosed CDATA section",
    };
  }

  const content = source.slice(start + 9, closeIdx);
  return {
    type: "cdata",
    content,
    raw: source.slice(start, closeIdx + 3),
    start,
    end: closeIdx + 3,
  };
}

// --- Read Doctype ------------------------------------------------------------

export function readDoctype(source: string, start: number): BlockReadResult {
  const closeIdx = source.indexOf(">", start);
  if (closeIdx === -1) {
    return {
      type: "doctype",
      content: source.slice(start),
      raw: source.slice(start),
      start,
      end: source.length,
      error: "Unclosed DOCTYPE",
    };
  }

  const content = source.slice(start, closeIdx + 1);
  return {
    type: "doctype",
    content,
    raw: content,
    start,
    end: closeIdx + 1,
  };
}

// --- Read Raw Text Block -----------------------------------------------------

export function readRawText(source: string, start: number, tagName: string): BlockReadResult {
  const closeTag = `</${tagName}`;
  const closeIdx = findClosingTag(source, start, closeTag);

  if (closeIdx === -1) {
    return {
      type: "raw",
      content: source.slice(start),
      raw: source.slice(start),
      start,
      end: source.length,
      error: `Unclosed <${tagName}> block`,
    };
  }

  const content = source.slice(start, closeIdx);
  const end = findTagEnd(source, closeIdx);

  return {
    type: "raw",
    content,
    raw: source.slice(start, end),
    start,
    end,
  };
}

// --- Brace Matching ----------------------------------------------------------

export function matchBraces(
  source: string,
  start: number,
  openChar: string = "{",
  closeChar: string = "}",
): { content: string; end: number; depth: number; error?: string } {
  let depth = 1;
  let i = start + 1;
  let content = "";
  let inString: string | null = null;

  while (i < source.length) {
    const ch = source[i];

    // Skip string content
    if (inString) {
      content += ch;
      if (ch === inString && source[i - 1] !== "\\") {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      content += ch;
      i++;
      continue;
    }

    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return { content, end: i + 1, depth: 0 };
      }
    }

    content += ch;
    i++;
  }

  return { content, end: i, depth, error: `Unmatched ${openChar}${closeChar}` };
}

export function matchParens(source: string, start: number): { content: string; end: number; error?: string } {
  return matchBraces(source, start, "(", ")");
}

export function matchBrackets(source: string, start: number): { content: string; end: number; error?: string } {
  return matchBraces(source, start, "[", "]");
}

// --- Helper Functions --------------------------------------------------------

function findClosingTag(source: string, start: number, closeTag: string): number {
  let i = start;
  let depth = 1;

  while (i < source.length) {
    const idx = source.indexOf(closeTag, i);
    if (idx === -1) return -1;

    // Check for opening tags of the same type (for nesting)
    const afterClose = source.indexOf(closeTag.replace("/", ""), i);
    if (afterClose !== -1 && afterClose < idx) {
      depth++;
      i = afterClose + closeTag.length - 1;
    } else {
      depth--;
      if (depth === 0) return idx;
      i = idx + closeTag.length;
    }
  }

  return -1;
}

function findTagEnd(source: string, tagStart: number): number {
  let i = tagStart;
  while (i < source.length && source[i] !== ">") {
    i++;
  }
  return i < source.length ? i + 1 : i;
}

// --- Block Detector ----------------------------------------------------------

export function detectBlockType(source: string, pos: number): BlockReadResult["type"] | null {
  if (source.slice(pos, pos + 4) === "<!--") return "comment";
  if (source.slice(pos, pos + 9) === "<![CDATA[") return "cdata";
  if (source.slice(pos, pos + 9).toLowerCase() === "<!doctype") return "doctype";
  if (source.slice(pos, pos + 7).toLowerCase() === "<script") return "script";
  if (source.slice(pos, pos + 6).toLowerCase() === "<style") return "style";
  if (source[pos] === "{" && source[pos + 1] === "%") return "twm";
  if (source[pos] === "{" && source[pos + 1] === "{") return "twm";
  return null;
}

export function readBlock(source: string, pos: number): BlockReadResult {
  const type = detectBlockType(source, pos);

  switch (type) {
    case "comment": return readComment(source, pos);
    case "cdata": return readCDATA(source, pos);
    case "doctype": return readDoctype(source, pos);
    case "script": return readScriptBlock(source, pos);
    case "style": return readStyleBlock(source, pos);
    case "twm": return readTwmBlock(source, pos);
    default:
      // Check for raw text tags
      const tagMatch = source.slice(pos).match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
      if (tagMatch && RAW_TEXT_TAGS.has(tagMatch[1].toLowerCase())) {
        return readRawText(source, pos, tagMatch[1].toLowerCase());
      }
      return {
        type: "raw",
        content: "",
        raw: "",
        start: pos,
        end: pos,
        error: "Unknown block type",
      };
  }
}

// --- Nested Block Reader ------------------------------------------------------

export function readNestedBlocks(source: string, start: number, end: number): BlockReadResult[] {
  const blocks: BlockReadResult[] = [];
  let i = start;

  while (i < end && i < source.length) {
    const blockType = detectBlockType(source, i);
    if (!blockType) {
      i++;
      continue;
    }

    const block = readBlock(source, i);
    blocks.push(block);
    i = block.end;
  }

  return blocks;
}
