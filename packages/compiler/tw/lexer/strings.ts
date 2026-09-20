/**
 * String escape handling -- full Unicode, template literals, multi-line,
 * all JavaScript escape sequences including \u{XXXX}, \xXX, \0, etc.
 */

export interface StringReadResult {
  value: string;
  raw: string;
  end: number;
  hasNewline: boolean;
  isTemplate: boolean;
  expressions: TemplateExpression[];
  error?: string;
}

export interface TemplateExpression {
  start: number;
  end: number;
  expression: string;
}

const ESCAPE_MAP: Record<string, string> = {
  "n": "\n",
  "r": "\r",
  "t": "\t",
  "b": "\b",
  "f": "\f",
  "v": "\v",
  "0": "\0",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "`": "`",
  "$": "$",
  "/": "/",
};

// Unicode line terminators
const LINE_TERMINATORS = new Set(["\n", "\r", "\u2028", "\u2029"]);

export function readString(
  source: string,
  start: number,
  quote: string = '"',
): StringReadResult {
  if (source[start] !== quote) {
    return { value: "", raw: "", end: start, hasNewline: false, isTemplate: false, expressions: [], error: `Expected ${quote}` };
  }

  let i = start + 1;
  let value = "";
  let hasNewline = false;
  const expressions: TemplateExpression[] = [];
  const isTemplate = quote === "`";

  while (i < source.length) {
    const ch = source[i];

    // Closing quote
    if (ch === quote) {
      if (!isTemplate || source[i - 1] !== "\\") {
        return {
          value,
          raw: source.slice(start, i + 1),
          end: i + 1,
          hasNewline,
          isTemplate,
          expressions,
        };
      }
    }

    // Template literal expression
    if (isTemplate && ch === "$" && source[i + 1] === "{") {
      const exprStart = i + 2;
      const exprResult = readTemplateExpression(source, exprStart);
      if (exprResult.end === -1) {
        return {
          value,
          raw: source.slice(start, i),
          end: source.length,
          hasNewline,
          isTemplate,
          expressions,
          error: "Unclosed template expression",
        };
      }
      expressions.push({
        start: exprStart,
        end: exprResult.end,
        expression: exprResult.text,
      });
      value += `\x00${expressions.length - 1}\x00`;
      i = exprResult.end + 1;
      continue;
    }

    // Escape sequences
    if (ch === "\\") {
      const escapeResult = readEscape(source, i);
      if (escapeResult.error) {
        return {
          value,
          raw: source.slice(start, i),
          end: i,
          hasNewline,
          isTemplate,
          expressions,
          error: escapeResult.error,
        };
      }
      value += escapeResult.value;
      if (LINE_TERMINATORS.has(escapeResult.value)) {
        hasNewline = true;
      }
      i = escapeResult.end;
      continue;
    }

    // Line terminators (illegal in non-template strings)
    if (LINE_TERMINATORS.has(ch)) {
      if (!isTemplate) {
        return {
          value,
          raw: source.slice(start, i),
          end: i,
          hasNewline: true,
          isTemplate,
          expressions,
          error: "Unterminated string literal",
        };
      }
      hasNewline = true;
    }

    value += ch;
    i++;
  }

  return {
    value,
    raw: source.slice(start, i),
    end: i,
    hasNewline,
    isTemplate,
    expressions,
    error: "Unterminated string literal",
  };
}

function readTemplateExpression(source: string, start: number): { text: string; end: number } {
  let i = start;
  let depth = 1;
  let text = "";

  while (i < source.length) {
    const ch = source[i];

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { text, end: i };
      }
    }

    // Skip nested strings
    if (ch === '"' || ch === "'" || ch === "`") {
      const strResult = readString(source, i, ch);
      text += strResult.raw;
      i = strResult.end;
      continue;
    }

    text += ch;
    i++;
  }

  return { text, end: -1 };
}

interface EscapeResult {
  value: string;
  end: number;
  error?: string;
}

function readEscape(source: string, start: number): EscapeResult {
  const ch = source[start + 1];

  if (ch === undefined) {
    return { value: "\\", end: start + 1, error: "Unterminated escape sequence" };
  }

  // Simple escapes
  if (ESCAPE_MAP[ch]) {
    return { value: ESCAPE_MAP[ch], end: start + 2 };
  }

  // Unicode escape \uXXXX
  if (ch === "u") {
    // \u{XXXXX} -- Unicode code point escape
    if (source[start + 2] === "{") {
      const end = source.indexOf("}", start + 3);
      if (end === -1) {
        return { value: "", end: start + 2, error: "Unterminated Unicode code point escape" };
      }
      const hex = source.slice(start + 3, end);
      const codePoint = parseInt(hex, 16);
      if (isNaN(codePoint) || codePoint > 0x10FFFF) {
        return { value: "", end, error: "Invalid Unicode code point" };
      }
      return { value: String.fromCodePoint(codePoint), end: end + 1 };
    }

    // \uXXXX -- Fixed-length Unicode escape
    const hex = source.slice(start + 2, start + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
      return { value: "", end: start + 2, error: "Invalid Unicode escape sequence" };
    }
    const codePoint = parseInt(hex, 16);
    return { value: String.fromCharCode(codePoint), end: start + 6 };
  }

  // Hex escape \xXX
  if (ch === "x") {
    const hex = source.slice(start + 2, start + 4);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
      return { value: "", end: start + 2, error: "Invalid hex escape sequence" };
    }
    const codePoint = parseInt(hex, 16);
    return { value: String.fromCharCode(codePoint), end: start + 4 };
  }

  // Octal escape (deprecated but supported)
  if (/^[0-7]$/.test(ch)) {
    let octal = ch;
    let i = start + 2;
    while (i < source.length && /^[0-7]$/.test(source[i]) && octal.length < 3) {
      octal += source[i];
      i++;
    }
    const codePoint = parseInt(octal, 8);
    if (codePoint > 255) {
      return { value: "", end: i, error: "Octal escape out of range" };
    }
    return { value: String.fromCharCode(codePoint), end: i };
  }

  // Null escape
  if (ch === "0" && !/^[0-9]/.test(source[start + 2] ?? "")) {
    return { value: "\0", end: start + 2 };
  }

  // Line continuation (backslash followed by line terminator)
  if (LINE_TERMINATORS.has(ch)) {
    return { value: "", end: start + 2 };
  }

  // Unknown escape -- keep the character as-is
  return { value: ch, end: start + 2 };
}

// --- String Validation ------------------------------------------------------

export function validateString(str: string): string[] {
  const errors: string[] = [];

  // Check for invalid control characters
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
      errors.push(`Invalid control character at position ${i}: \\x${code.toString(16).padStart(2, "0")}`);
    }
  }

  return errors;
}

// --- String Utilities --------------------------------------------------------

export function unescapeString(raw: string): string {
  if (!raw.startsWith('"') && !raw.startsWith("'") && !raw.startsWith("`")) {
    return raw;
  }
  const quote = raw[0];
  const inner = raw.slice(1, raw.endsWith(quote) ? -1 : undefined);
  let result = "";
  let i = 0;

  while (i < inner.length) {
    if (inner[i] === "\\" && i + 1 < inner.length) {
      const escapeResult = readEscape(inner, i);
      result += escapeResult.value;
      i = escapeResult.end;
    } else {
      result += inner[i];
      i++;
    }
  }

  return result;
}

export function escapeString(str: string, quote: string = '"'): string {
  let result = quote;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    switch (ch) {
      case "\\": result += "\\\\"; break;
      case quote: result += `\\${ch}`; break;
      case "\n": result += "\\n"; break;
      case "\r": result += "\\r"; break;
      case "\t": result += "\\t"; break;
      case "\b": result += "\\b"; break;
      case "\f": result += "\\f"; break;
      case "\v": result += "\\v"; break;
      case "\0": result += "\\0"; break;
      default:
        const code = ch.charCodeAt(0);
        if (code < 0x20) {
          result += `\\x${code.toString(16).padStart(2, "0")}`;
        } else if (code > 0xFFFF) {
          // Supplementary plane -- use \u{XXXXX}
          result += `\\u{${code.toString(16)}}`;
        } else if (code > 0x7E) {
          result += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          result += ch;
        }
    }
  }

  result += quote;
  return result;
}

export function isStringDelimiter(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === "`";
}

export function getStringDelimiter(str: string): string | null {
  if (str.length === 0) return null;
  return isStringDelimiter(str[0]) ? str[0] : null;
}

// --- Regex Reading -----------------------------------------------------------

export interface RegexReadResult {
  pattern: string;
  flags: string;
  raw: string;
  end: number;
  error?: string;
}

export function readRegex(source: string, start: number): RegexReadResult {
  if (source[start] !== "/") {
    return { pattern: "", flags: "", raw: "", end: start, error: "Expected /" };
  }

  let i = start + 1;
  let pattern = "";
  let inClass = false;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "\\") {
      pattern += ch;
      if (i + 1 < source.length) {
        pattern += source[i + 1];
        i += 2;
        continue;
      }
    }

    if (ch === "[") inClass = true;
    if (ch === "]") inClass = false;

    if (ch === "/" && !inClass) {
      // End of pattern -- read flags
      i++;
      let flags = "";
      while (i < source.length && /[gimsuyd]/.test(source[i])) {
        flags += source[i];
        i++;
      }
      return { pattern, flags, raw: source.slice(start, i), end: i };
    }

    if (ch === "\n" || ch === "\r") {
      return { pattern, flags: "", raw: source.slice(start, i), end: i, error: "Unterminated regex literal" };
    }

    pattern += ch;
    i++;
  }

  return { pattern, flags: "", raw: source.slice(start, i), end: i, error: "Unterminated regex literal" };
}

// --- Number Reading ---------------------------------------------------------

export interface NumberReadResult {
  value: string;
  raw: string;
  end: number;
  isFloat: boolean;
  isBigInt: boolean;
  radix: number;
  error?: string;
}

export function readNumber(source: string, start: number): NumberReadResult {
  let i = start;
  let value = "";
  let isFloat = false;
  let isBigInt = false;
  let radix = 10;

  // Check for hex, octal, binary
  if (source[i] === "0" && i + 1 < source.length) {
    const next = source[i + 1].toLowerCase();
    if (next === "x") {
      radix = 16;
      i += 2;
      while (i < source.length && /[0-9a-fA-F_]/.test(source[i])) {
        value += source[i];
        i++;
      }
      return { value, raw: source.slice(start, i), end: i, isFloat: false, isBigInt, radix };
    }
    if (next === "o") {
      radix = 8;
      i += 2;
      while (i < source.length && /[0-7_]/.test(source[i])) {
        value += source[i];
        i++;
      }
      return { value, raw: source.slice(start, i), end: i, isFloat: false, isBigInt, radix };
    }
    if (next === "b") {
      radix = 2;
      i += 2;
      while (i < source.length && /[01_]/.test(source[i])) {
        value += source[i];
        i++;
      }
      return { value, raw: source.slice(start, i), end: i, isFloat: false, isBigInt, radix };
    }
  }

  // Decimal number
  while (i < source.length && /[0-9_]/.test(source[i])) {
    value += source[i];
    i++;
  }

  // Fractional part
  if (source[i] === "." && /[0-9]/.test(source[i + 1] ?? "")) {
    isFloat = true;
    value += ".";
    i++;
    while (i < source.length && /[0-9_]/.test(source[i])) {
      value += source[i];
      i++;
    }
  }

  // Exponent
  if (source[i] === "e" || source[i] === "E") {
    isFloat = true;
    value += source[i];
    i++;
    if (source[i] === "+" || source[i] === "-") {
      value += source[i];
      i++;
    }
    while (i < source.length && /[0-9_]/.test(source[i])) {
      value += source[i];
      i++;
    }
  }

  // BigInt suffix
  if (source[i] === "n") {
    isBigInt = true;
    i++;
  }

  return { value, raw: source.slice(start, i), end: i, isFloat, isBigInt, radix };
}
