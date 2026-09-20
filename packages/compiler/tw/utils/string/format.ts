/** String formatting utilities. */

export function indent(str: string, level: number, pad: string = "  "): string {
  const prefix = pad.repeat(level);
  return str
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

export function dedent(str: string): string {
  const lines = str.split("\n");
  let minIndent = Infinity;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^(\s*)/);
    if (match) {
      minIndent = Math.min(minIndent, match[1].length);
    }
  }

  if (minIndent === Infinity || minIndent === 0) return str;
  return lines.map((line) => line.slice(minIndent)).join("\n");
}

export function pad(str: string, length: number, char: string = " "): string {
  return str.padEnd(length, char);
}

export function padStart(str: string, length: number, char: string = " "): string {
  return str.padStart(length, char);
}

export function center(str: string, length: number, char: string = " "): string {
  const padLen = Math.max(0, length - str.length);
  const leftPad = Math.floor(padLen / 2);
  const rightPad = padLen - leftPad;
  return char.repeat(leftPad) + str + char.repeat(rightPad);
}

export function wrap(str: string, width: number, indent: string = ""): string {
  const words = str.split(" ");
  const lines: string[] = [];
  let current = indent;

  for (const word of words) {
    if (current.length + word.length + 1 > width + indent.length && current !== indent) {
      lines.push(current);
      current = indent + word;
    } else {
      current += (current === indent ? "" : " ") + word;
    }
  }

  if (current !== indent) lines.push(current);
  return lines.join("\n");
}

export function stripWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

export function stripComments(str: string): string {
  return str.replace(/<!--[\s\S]*?-->/g, "");
}

export function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export function countLines(str: string): number {
  return str.split("\n").length;
}

export function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

export function countChars(str: string, char: string): number {
  return (str.match(new RegExp(escapeRegExp(char), "g")) || []).length;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
