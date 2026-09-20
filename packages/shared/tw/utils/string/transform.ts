/**
 * String transformation utilities.
 * @module shared/utils/string
 */

export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function uncapitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (word) => capitalize(word.toLowerCase()));
}

export function sentenceCase(str: string): string {
  return str.replace(/(^[a-z])|([.!?]\s+[a-z])/g, (match) => match.toUpperCase());
}

export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)|^(.)/g, (_, p1, p2) => (p1 || p2 || "").toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

export function pascalCase(str: string): string {
  return capitalize(camelCase(str));
}

export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export function constantCase(str: string): string {
  return snakeCase(str).toUpperCase();
}

export function dotCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1.$2")
    .replace(/[-_\s]+/g, ".")
    .toLowerCase();
}

export function reverse(str: string): string {
  return [...str].reverse().join("");
}

export function truncate(str: string, length: number, suffix: string = "..."): string {
  if (str.length <= length) return str;
  return str.slice(0, length - suffix.length) + suffix;
}

export function truncateMiddle(str: string, length: number, separator: string = "..."): string {
  if (str.length <= length) return str;
  const sepLen = separator.length;
  const charsToShow = length - sepLen;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return str.slice(0, frontChars) + separator + str.slice(str.length - backChars);
}

export function pad(str: string, length: number, char: string = " ", align: "left" | "right" | "center" = "left"): string {
  if (str.length >= length) return str;
  const padding = char.repeat(length - str.length);
  if (align === "right") return padding + str;
  if (align === "center") {
    const half = Math.floor(padding.length / 2);
    return padding.slice(0, half) + str + padding.slice(half);
  }
  return str + padding;
}

export function repeat(str: string, count: number, separator: string = ""): string {
  if (count <= 0) return "";
  if (count === 1) return str;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(str);
  }
  return parts.join(separator);
}

export function count(str: string, substring: string): number {
  if (!substring) return 0;
  let count = 0;
  let idx = str.indexOf(substring);
  while (idx !== -1) {
    count++;
    idx = str.indexOf(substring, idx + substring.length);
  }
  return count;
}

export function countLines(str: string): number {
  return str.split("\n").length;
}

export function countWords(str: string): number {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countChars(str: string, includeSpaces: boolean = true): number {
  if (includeSpaces) return str.length;
  return str.replace(/\s/g, "").length;
}

export function countSentences(str: string): number {
  const matches = str.match(/[.!?]+\s/g);
  return matches ? matches.length : (str.trim() ? 1 : 0);
}

export function countParagraphs(str: string): number {
  const paragraphs = str.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return paragraphs.length;
}

export function readingTime(str: string, wordsPerMinute: number = 200): number {
  const words = countWords(str);
  return Math.ceil(words / wordsPerMinute);
}

export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export function stripTags(str: string, ...allowedTags: string[]): string {
  if (allowedTags.length === 0) return stripHtml(str);
  const allowed = allowedTags.join("|");
  const regex = new RegExp(`</?(?!/?(${allowed})\b)[^>]*>`, "gi");
  return str.replace(regex, "");
}

export function stripWhitespace(str: string): string {
  return str.replace(/\s+/g, "");
}

export function stripNumbers(str: string): string {
  return str.replace(/[0-9]/g, "");
}

export function stripPunctuation(str: string): string {
  return str.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'<>@]/g, "");
}

export function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function stripEmojis(str: string): string {
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
}

export function replaceAll(str: string, search: string, replacement: string): string {
  return str.split(search).join(replacement);
}

export function replaceFirst(str: string, search: string, replacement: string): string {
  const idx = str.indexOf(search);
  if (idx === -1) return str;
  return str.slice(0, idx) + replacement + str.slice(idx + search.length);
}

export function replaceLast(str: string, search: string, replacement: string): string {
  const idx = str.lastIndexOf(search);
  if (idx === -1) return str;
  return str.slice(0, idx) + replacement + str.slice(idx + search.length);
}

export function insert(str: string, index: number, substring: string): string {
  if (index < 0) index = Math.max(0, str.length + index);
  if (index > str.length) index = str.length;
  return str.slice(0, index) + substring + str.slice(index);
}

export function remove(str: string, start: number, end: number): string {
  return str.slice(0, start) + str.slice(end);
}

export function substringBefore(str: string, delimiter: string): string {
  const idx = str.indexOf(delimiter);
  return idx === -1 ? str : str.slice(0, idx);
}

export function substringAfter(str: string, delimiter: string): string {
  const idx = str.indexOf(delimiter);
  return idx === -1 ? "" : str.slice(idx + delimiter.length);
}

export function substringBeforeLast(str: string, delimiter: string): string {
  const idx = str.lastIndexOf(delimiter);
  return idx === -1 ? str : str.slice(0, idx);
}

export function substringAfterLast(str: string, delimiter: string): string {
  const idx = str.lastIndexOf(delimiter);
  return idx === -1 ? "" : str.slice(idx + delimiter.length);
}

export function substringBetween(str: string, start: string, end: string): string {
  const startIdx = str.indexOf(start);
  if (startIdx === -1) return "";
  const endIdx = str.indexOf(end, startIdx + start.length);
  if (endIdx === -1) return "";
  return str.slice(startIdx + start.length, endIdx);
}

export function substringsBetween(str: string, start: string, end: string): string[] {
  const results: string[] = [];
  let searchStr = str;
  let startIdx = searchStr.indexOf(start);
  while (startIdx !== -1) {
    const endIdx = searchStr.indexOf(end, startIdx + start.length);
    if (endIdx === -1) break;
    results.push(searchStr.slice(startIdx + start.length, endIdx));
    searchStr = searchStr.slice(endIdx + end.length);
    startIdx = searchStr.indexOf(start);
  }
  return results;
}

export function startsWith(str: string, prefix: string, position: number = 0): boolean {
  return str.slice(position, position + prefix.length) === prefix;
}

export function endsWith(str: string, suffix: string, position: number = str.length): boolean {
  const pos = Math.min(position, str.length);
  return str.slice(pos - suffix.length, pos) === suffix;
}

export function includes(str: string, substring: string, position: number = 0): boolean {
  return str.indexOf(substring, position) !== -1;
}

export function isEmpty(str: string): boolean {
  return str.length === 0;
}

export function isBlank(str: string): boolean {
  return str.trim().length === 0;
}

export function isNotEmpty(str: string): boolean {
  return str.length > 0;
}

export function isNotBlank(str: string): boolean {
  return str.trim().length > 0;
}

export function isAlpha(str: string): boolean {
  return /^[a-zA-Z]+$/.test(str);
}

export function isAlphanumeric(str: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(str);
}

export function isNumeric(str: string): boolean {
  return /^[0-9]+$/.test(str);
}

export function isLowerCase(str: string): boolean {
  return str === str.toLowerCase() && str !== str.toUpperCase();
}

export function isUpperCase(str: string): boolean {
  return str === str.toUpperCase() && str !== str.toLowerCase();
}

export function toCharArray(str: string): string[] {
  return [...str];
}

export function chunk(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

export function split(str: string, delimiter: string | RegExp, limit: number = -1): string[] {
  const parts = str.split(delimiter);
  return limit > 0 ? parts.slice(0, limit) : parts;
}

export function splitLines(str: string, keepEmpty: boolean = false): string[] {
  const lines = str.split(/\r?\n/);
  return keepEmpty ? lines : lines.filter((line) => line.trim().length > 0);
}

export function splitWords(str: string): string[] {
  return str.trim().split(/\s+/).filter((word) => word.length > 0);
}

export function splitCamelCase(str: string): string[] {
  return str.split(/(?=[A-Z])/).filter((word) => word.length > 0);
}

export function join(strings: string[], separator: string = ""): string {
  return strings.join(separator);
}

export function joinNonEmpty(strings: string[], separator: string = ""): string {
  return strings.filter((s) => s && s.length > 0).join(separator);
}

export function template(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

export function templateAlt(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\$(\w+)/g, (_, key) => String(vars[key] ?? ""));
}

export function sortCharacters(str: string, descending: boolean = false): string {
  const chars = [...str].sort();
  if (descending) chars.reverse();
  return chars.join("");
}

export function uniqueCharacters(str: string): string {
  const seen = new Set<string>();
  let result = "";
  for (const char of str) {
    if (!seen.has(char)) {
      seen.add(char);
      result += char;
    }
  }
  return result;
}

export function reverseWords(str: string): string {
  return str.split(/\s+/).reverse().join(" ");
}

export function shuffle(str: string, seed?: number): string {
  const chars = [...str];
  let rng = seed ?? Date.now();
  for (let i = chars.length - 1; i > 0; i--) {
    rng = (rng * 9301 + 49297) % 233280;
    const j = Math.floor((rng / 233280) * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function slugify(str: string, separator: string = "-"): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, separator)
    .replace(new RegExp(`${separator}+`, "g"), separator);
}

export function unslugify(str: string, separator: string = "-"): string {
  return str
    .split(separator)
    .map((word) => capitalize(word))
    .join(" ");
}

export function highlight(str: string, term: string, wrapper: [string, string] = ["<mark>", "</mark>"]): string {
  if (!term) return str;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return str.replace(new RegExp(escaped, "gi"), (match) => `${wrapper[0]}${match}${wrapper[1]}`);
}

export function mask(str: string, startVisible: number = 0, endVisible: number = 0, maskChar: string = "*"): string {
  if (str.length <= startVisible + endVisible) return maskChar.repeat(str.length);
  const start = str.slice(0, startVisible);
  const end = str.slice(str.length - endVisible);
  const masked = maskChar.repeat(str.length - startVisible - endVisible);
  return start + masked + end;
}

export function maskEmail(str: string): string {
  const [local, domain] = str.split("@");
  if (!domain) return mask(str, 1, 0);
  return mask(local, 1, 1) + "@" + domain;
}

export function maskPhone(str: string): string {
  const digits = str.replace(/\D/g, "");
  if (digits.length < 4) return str;
  return mask(digits, 0, 2).replace(/(.{4})(?=.)/g, "$1 ");
}

export function maskCreditCard(str: string): string {
  const digits = str.replace(/\D/g, "");
  if (digits.length < 4) return str;
  return mask(digits, 0, 4).replace(/(.{4})(?=.)/g, "$1 ");
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  const distance = matrix[b.length][a.length];
  return 1 - distance / Math.max(a.length, b.length);
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error("Strings must be of equal length");
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aMatches[i]) {
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }
  }
  transpositions /= 2;
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

export function jaroWinklerSimilarity(a: string, b: string, prefixWeight: number = 0.1): number {
  const jaro = jaroSimilarity(a, b);
  let prefixLength = 0;
  const maxPrefix = Math.min(4, Math.min(a.length, b.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefixLength++;
    else break;
  }
  return jaro + prefixLength * prefixWeight * (1 - jaro);
}

export function fuzzyMatch(str: string, pattern: string, threshold: number = 0.7): boolean {
  return jaroWinklerSimilarity(str.toLowerCase(), pattern.toLowerCase()) >= threshold;
}

export function search(str: string, query: string, options: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean } = {}): number[] {
  const { caseSensitive = false, wholeWord = false, regex = false } = options;
  const flags = caseSensitive ? "g" : "gi";
  const pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fullPattern = wholeWord ? `\\b${pattern}\\b` : pattern;
  const re = new RegExp(fullPattern, flags);
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(str)) !== null) {
    indices.push(match.index);
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return indices;
}

export function replacePattern(str: string, pattern: string | RegExp, replacement: string | ((match: string, ...args: unknown[]) => string)): string {
  return str.replace(pattern, replacement as never);
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(str: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return str.replace(/[&<>"']/g, (char) => entities[char] ?? char);
}

export function unescapeHtml(str: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&#x2F;": "/",
    "&sol;": "/",
  };
  return str.replace(/&[a-z#0-9]+;/gi, (m) => entities[m] ?? m);
}

export function escapeUrl(str: string): string {
  return encodeURIComponent(str);
}

export function unescapeUrl(str: string): string {
  return decodeURIComponent(str);
}

export function wrap(str: string, width: number, indent: string = ""): string {
  const words = str.split(/\s+/);
  const lines: string[] = [];
  let currentLine = indent;
  for (const word of words) {
    if (currentLine.length + word.length + 1 > width && currentLine.trim()) {
      lines.push(currentLine);
      currentLine = indent + word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : indent + word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join("\n");
}

export function unwrap(str: string): string {
  return str.replace(/\n\s*/g, " ");
}

export function indent(str: string, spaces: number = 2): string {
  const pad = " ".repeat(spaces);
  return str.split("\n").map((line) => pad + line).join("\n");
}

export function dedent(str: string): string {
  const lines = str.split("\n");
  const minIndent = Math.min(
    ...lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^\s*/)?.[0].length ?? 0),
  );
  return lines.map((line) => line.slice(minIndent)).join("\n");
}

export function trimLines(str: string): string {
  return str.split("\n").map((line) => line.trim()).join("\n");
}

export function removeEmptyLines(str: string): string {
  return str.split("\n").filter((line) => line.trim().length > 0).join("\n");
}

export function compactWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

export function normalizeLineEndings(str: string, ending: "\n" | "\r\n" | "\r" = "\n"): string {
  return str.replace(/\r\n|\r|\n/g, ending);
}

export function toUnicode(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    result += "\\u" + code.toString(16).padStart(4, "0");
  }
  return result;
}

export function fromUnicode(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function toBase64(str: string): string {
  if (typeof btoa !== "undefined") return btoa(str);
  if (typeof Buffer !== "undefined") return Buffer.from(str, "utf-8").toString("base64");
  return str;
}

export function fromBase64(str: string): string {
  if (typeof atob !== "undefined") return atob(str);
  if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
  return str;
}

export function toHex(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return result;
}

export function fromHex(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i += 2) {
    result += String.fromCharCode(parseInt(str.slice(i, i + 2), 16));
  }
  return result;
}

export function toBinary(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += str.charCodeAt(i).toString(2).padStart(8, "0");
  }
  return result;
}

export function fromBinary(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i += 8) {
    result += String.fromCharCode(parseInt(str.slice(i, i + 8), 2));
  }
  return result;
}

export function rotate(str: string, n: number): string {
  const len = str.length;
  const shift = ((n % len) + len) % len;
  return str.slice(shift) + str.slice(0, shift);
}

export function caesarCipher(str: string, shift: number): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + shift) % 26 + 26) % 26 + base);
  });
}

export function rot13(str: string): string {
  return caesarCipher(str, 13);
}

export function atbash(str: string): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(25 - (char.charCodeAt(0) - base) + base);
  });
}

export function countVowels(str: string): number {
  return (str.match(/[aeiouAEIOU]/g) || []).length;
}

export function countConsonants(str: string): number {
  return (str.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/g) || []).length;
}

export function swapCase(str: string): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    return char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
  });
}

export function randomString(length: number, charset: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

export function randomHex(length: number): string {
  return randomString(length, "0123456789abcdef");
}

export function randomAlpha(length: number): string {
  return randomString(length, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ");
}

export function randomAlphanumeric(length: number): string {
  return randomString(length, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
}

export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function nanoId(length: number = 21): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  return randomString(length, charset);
}

export function loremIpsum(sentences: number = 5, wordsPerSentence: number = 15): string {
  const words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate", "velit", "esse", "cillum", "eu", "fugiat", "nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id", "est", "laborum"];
  const result: string[] = [];
  for (let s = 0; s < sentences; s++) {
    const sentence: string[] = [];
    for (let w = 0; w < wordsPerSentence; w++) {
      sentence.push(words[Math.floor(Math.random() * words.length)]);
    }
    let sentenceStr = sentence.join(" ");
    sentenceStr = sentenceStr.charAt(0).toUpperCase() + sentenceStr.slice(1) + ".";
    result.push(sentenceStr);
  }
  return result.join(" ");
}

export function extractEmails(str: string): string[] {
  const matches = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return matches ?? [];
}

export function extractUrls(str: string): string[] {
  const matches = str.match(/https?:\/\/[a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,})(?:\/[^\s]*)?/g);
  return matches ?? [];
}

export function extractPhoneNumbers(str: string): string[] {
  const matches = str.match(/\+?[0-9]{1,4}?[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}/g);
  return matches ?? [];
}

export function extractNumbers(str: string): number[] {
  const matches = str.match(/-?\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

export function extractHashtags(str: string): string[] {
  const matches = str.match(/#[a-zA-Z0-9_]+/g);
  return matches ?? [];
}

export function extractMentions(str: string): string[] {
  const matches = str.match(/@[a-zA-Z0-9_]+/g);
  return matches ?? [];
}

export function extractIPv4(str: string): string[] {
  const matches = str.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g);
  return matches ?? [];
}

export function extractIPv6(str: string): string[] {
  const matches = str.match(/(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g);
  return matches ?? [];
}

export function extractMacAddresses(str: string): string[] {
  const matches = str.match(/(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/g);
  return matches ?? [];
}

export function extractCreditCards(str: string): string[] {
  const matches = str.match(/(?:[0-9]{4}[- ]?){3}[0-9]{4}/g);
  return matches ?? [];
}

export function extractZipCodes(str: string): string[] {
  const matches = str.match(/\b[0-9]{5}(?:-[0-9]{4})?\b/g);
  return matches ?? [];
}

export function extractSocialSecurityNumbers(str: string): string[] {
  const matches = str.match(/\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g);
  return matches ?? [];
}

export function extractDates(str: string): string[] {
  const matches = str.match(/\b\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}\b/g);
  return matches ?? [];
}

export function extractTimes(str: string): string[] {
  const matches = str.match(/\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?\b/g);
  return matches ?? [];
}

export function extractHexColors(str: string): string[] {
  const matches = str.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g);
  return matches ?? [];
}

export function extractRGBColors(str: string): string[] {
  const matches = str.match(/rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)/g);
  return matches ?? [];
}

export function extractRGBAColors(str: string): string[] {
  const matches = str.match(/rgba\(\s*(?:\d{1,3}\s*,\s*){3}[0-9.]+\s*\)/g);
  return matches ?? [];
}

export function extractHSLColors(str: string): string[] {
  const matches = str.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)/g);
  return matches ?? [];
}

export function versionCompare(a: string, b: string): number {
  const partsA = a.split(".").map((p) => parseInt(p.replace(/\D/g, "")) || 0);
  const partsB = b.split(".").map((p) => parseInt(p.replace(/\D/g, "")) || 0);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  return 0;
}

export function semverParse(version: string): { major: number; minor: number; patch: number; prerelease: string[]; build: string[] } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
    build: match[5] ? match[5].split(".") : [],
  };
}

export function semverCompare(a: string, b: string): number {
  const pa = semverParse(a);
  const pb = semverParse(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.prerelease.length === 0 && pb.prerelease.length > 0) return 1;
  if (pa.prerelease.length > 0 && pb.prerelease.length === 0) return -1;
  for (let i = 0; i < Math.min(pa.prerelease.length, pb.prerelease.length); i++) {
    const ai = pa.prerelease[i];
    const bi = pb.prerelease[i];
    if (ai !== bi) {
      const aNum = parseInt(ai);
      const bNum = parseInt(bi);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return ai < bi ? -1 : 1;
    }
  }
  return pa.prerelease.length - pb.prerelease.length;
}

export function semverSatisfies(version: string, range: string): boolean {
  const cleanRange = range.trim();
  if (cleanRange === "*") return true;
  const operators = [">=", "<=", ">", "<", "==", "="];
  for (const op of operators) {
    if (cleanRange.startsWith(op)) {
      const target = cleanRange.slice(op.length).trim();
      const cmp = semverCompare(version, target);
      switch (op) {
        case ">=": return cmp >= 0;
        case "<=": return cmp <= 0;
        case ">": return cmp > 0;
        case "<": return cmp < 0;
        case "==":
        case "=": return cmp === 0;
      }
    }
  }
  const tildeMatch = cleanRange.match(/^~(.+)$/);
  if (tildeMatch) {
    const target = tildeMatch[1];
    const pa = semverParse(version);
    const pb = semverParse(target);
    return pa.major === pb.major && (pa.minor > pb.minor || (pa.minor === pb.minor && pa.patch >= pb.patch));
  }
  const caretMatch = cleanRange.match(/^\^(.+)$/);
  if (caretMatch) {
    const target = caretMatch[1];
    const pa = semverParse(version);
    const pb = semverParse(target);
    if (pa.major !== pb.major) return false;
    if (pa.major === 0 && pa.minor !== pb.minor) return false;
    return semverCompare(version, target) >= 0;
  }
  return semverCompare(version, cleanRange) === 0;
}
