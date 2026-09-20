/** Text processing utilities. */

export function splitLines(str: string, keepEmpty: boolean = false): string[] {
  return str.split(/\r?\n/).filter((line) => keepEmpty || line.trim().length > 0);
}

export function joinLines(lines: string[], separator: string = "\n"): string {
  return lines.join(separator);
}

export function trimLines(str: string): string {
  return str.split("\n").map((line) => line.trim()).join("\n");
}

export function normalizeWhitespace(str: string): string {
  return str.replace(/\r\n/g, "\n").replace(/\t/g, "  ").replace(/ +$/gm, "");
}

export function collapseWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

export function removeEmptyLines(str: string): string {
  return str.split("\n").filter((line) => line.trim().length > 0).join("\n");
}

export function padNumber(num: number, length: number, char: string = "0"): string {
  return String(num).padStart(length, char);
}

export function toFixed(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(decimals)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)}GB`;
}

export function formatTime(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? singular + "s");
}

export function generateId(length: number = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash >>> 0;
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  const longerLength = longer.length;
  const distance = levenshtein(longer, shorter);
  return (longerLength - distance) / longerLength;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
