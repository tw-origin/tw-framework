/**
 * Path utilities -- join, normalize, parse, resolve paths.
 * @module runtime/utils
 */

export function joinPath(...paths: string[]): string {
  const parts: string[] = [];
  for (const path of paths) {
    const segments = path.split(/[/\\]/).filter(Boolean);
    parts.push(...segments);
  }
  let result = parts.join("/");
  if (paths[0]?.startsWith("/")) result = "/" + result;
  return normalizePath(result);
}

export function normalizePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const segments = path.split(/[/\\]/);
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      } else if (!isAbsolute) {
        result.push("..");
      }
    } else {
      result.push(segment);
    }
  }
  if (result.length === 0) return isAbsolute ? "/" : ".";
  return (isAbsolute ? "/" : "") + result.join("/");
}

export function resolvePath(...paths: string[]): string {
  let resolved = "";
  for (const path of paths) {
    if (path.startsWith("/")) {
      resolved = path;
    } else {
      resolved = joinPath(resolved, path);
    }
  }
  return normalizePath(resolved);
}

export function relativePath(from: string, to: string): string {
  const fromParts = normalizePath(from).split("/").filter(Boolean);
  const toParts = normalizePath(to).split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++;
  }
  const upCount = fromParts.length - i;
  const downParts = toParts.slice(i);
  const result: string[] = [];
  for (let j = 0; j < upCount; j++) {
    result.push("..");
  }
  result.push(...downParts);
  return result.length === 0 ? "." : result.join("/");
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}

export function basename(path: string, ext?: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  let name = index === -1 ? normalized : normalized.slice(index + 1);
  if (ext && name.endsWith(ext)) {
    name = name.slice(0, name.length - ext.length);
  }
  return name;
}

export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  if (index === 0 || index === -1) return "";
  return name.slice(index);
}

export function parsePath(path: string): { root: string; dir: string; base: string; name: string; ext: string } {
  const normalized = path.replace(/\\/g, "/");
  const root = normalized.startsWith("/") ? "/" : "";
  const withoutRoot = root ? normalized.slice(1) : normalized;
  const lastSlash = withoutRoot.lastIndexOf("/");
  const dir = lastSlash === -1 ? root : root + withoutRoot.slice(0, lastSlash);
  const base = lastSlash === -1 ? withoutRoot : withoutRoot.slice(lastSlash + 1);
  const lastDot = base.lastIndexOf(".");
  const name = lastDot === -1 || lastDot === 0 ? base : base.slice(0, lastDot);
  const ext = lastDot === -1 || lastDot === 0 ? "" : base.slice(lastDot);
  return { root, dir, base, name, ext };
}

export function formatPath(parts: { root?: string; dir?: string; base?: string; name?: string; ext?: string }): string {
  const dir = parts.dir ?? "";
  const base = parts.base ?? `${parts.name ?? ""}${parts.ext ?? ""}`;
  if (dir) {
    return joinPath(dir, base);
  }
  return base;
}

export function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:/.test(path);
}

export function isRelative(path: string): boolean {
  return !isAbsolute(path);
}

export function toAbsolutePath(path: string, base: string = "."): string {
  if (isAbsolute(path)) return normalizePath(path);
  return resolvePath(base, path);
}

export function toRelativePath(path: string, base: string = "."): string {
  return relativePath(base, path);
}

export function ensureExt(path: string, ext: string): string {
  if (extname(path) === ext) return path;
  return path + ext;
}

export function removeExt(path: string): string {
  const ext = extname(path);
  if (!ext) return path;
  return path.slice(0, path.length - ext.length);
}

export function changeExt(path: string, ext: string): string {
  const withoutExt = removeExt(path);
  return withoutExt + (ext.startsWith(".") ? ext : "." + ext);
}

export function addTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : path + "/";
}

export function removeTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function addLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : "/" + path;
}

export function removeLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

export function hasExt(path: string, ext?: string): boolean {
  const fileExt = extname(path);
  if (!ext) return fileExt !== "";
  const normalizedExt = ext.startsWith(".") ? ext : "." + ext;
  return fileExt === normalizedExt;
}

export function getSegments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

export function getDepth(path: string): number {
  return getSegments(path).length;
}

export function isSubpath(parent: string, child: string): boolean {
  const parentNorm = normalizePath(parent);
  const childNorm = normalizePath(child);
  return childNorm.startsWith(parentNorm + "/") || childNorm === parentNorm;
}

export function getParent(path: string): string {
  return dirname(path);
}

export function getChild(path: string, child: string): string {
  return joinPath(path, child);
}

export function getSiblings(path: string): string[] {
  const parent = dirname(path);
  const name = basename(path);
  return [joinPath(parent, name), parent];
}

export function getExtension(path: string): string {
  return extname(path).slice(1);
}

export function getFilename(path: string): string {
  return basename(path);
}

export function getFilenameWithoutExt(path: string): string {
  const ext = extname(path);
  return basename(path).slice(0, basename(path).length - ext.length);
}

export function matchesGlob(path: string, pattern: string): boolean {
  let regex = globToRegex(pattern);
  return regex.test(path);
}

export function globToRegex(pattern: string): RegExp {
  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        regex += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        regex += "[^/]*";
        i++;
      }
    } else if (char === "?") {
      regex += "[^/]";
      i++;
    } else if (char === ".") {
      regex += "\.";
      i++;
    } else if (char === "/") {
      regex += "/";
      i++;
    } else if (char === "{") {
      const end = pattern.indexOf("}", i);
      if (end !== -1) {
        const options = pattern.slice(i + 1, end);
        regex += `(${options.split(",").join("|")})`;
        i = end + 1;
      } else {
        regex += char;
        i++;
      }
    } else {
      regex += char;
      i++;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

export function resolveGlob(pattern: string, base: string = "."): string[] {
  return [normalizePath(joinPath(base, pattern))];
}

export function splitPath(path: string): string[] {
  return getSegments(path);
}

export function containsPath(path: string, segment: string): boolean {
  return getSegments(path).includes(segment);
}

export function startsWithPath(path: string, prefix: string): boolean {
  const pathSegments = getSegments(path);
  const prefixSegments = getSegments(prefix);
  if (pathSegments.length < prefixSegments.length) return false;
  for (let i = 0; i < prefixSegments.length; i++) {
    if (pathSegments[i] !== prefixSegments[i]) return false;
  }
  return true;
}

export function endsWithPath(path: string, suffix: string): boolean {
  const pathSegments = getSegments(path);
  const suffixSegments = getSegments(suffix);
  if (pathSegments.length < suffixSegments.length) return false;
  const offset = pathSegments.length - suffixSegments.length;
  for (let i = 0; i < suffixSegments.length; i++) {
    if (pathSegments[offset + i] !== suffixSegments[i]) return false;
  }
  return true;
}

export function commonPath(paths: string[]): string {
  if (paths.length === 0) return "";
  const segments = paths.map(getSegments);
  let common: string[] = [];
  for (let i = 0; i < segments[0].length; i++) {
    const segment = segments[0][i];
    if (segments.every((s) => s[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }
  return common.length === 0 ? "/" : "/" + common.join("/");
}

export function dedupePath(path: string): string {
  return normalizePath(path);
}

export function simplifyPath(path: string): string {
  return normalizePath(path);
}

export function isValidPath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.includes("\0")) return false;
  if (/^[a-zA-Z]:[\/]/.test(path)) return true;
  if (path.startsWith("/")) return true;
  if (path.startsWith("./") || path.startsWith("../")) return true;
  return true;
}

export function isHidden(path: string): boolean {
  const name = basename(path);
  return name.startsWith(".");
}

export function isVisible(path: string): boolean {
  return !isHidden(path);
}

export function toUnixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

export function toURL(path: string): string {
  return `file://${toUnixPath(path)}`;
}

export function fromURL(url: string): string {
  return url.replace(/^file:\/\//, "");
}

export function encodePath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/g, "/");
}

export function decodePath(path: string): string {
  return decodeURIComponent(path);
}

export function sanitizePath(path: string): string {
  return path.replace(/\.\.[\/\\]/g, "").replace(/[<>:"|?*]/g, "");
}

export function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) return path;
  const filename = basename(path);
  const dir = dirname(path);
  const remaining = maxLength - filename.length - 3;
  if (remaining <= 0) return "..." + filename.slice(-maxLength + 3);
  return dir.slice(0, remaining) + "..." + "/" + filename;
}

export function pathDistance(a: string, b: string): number {
  const aSegments = getSegments(a);
  const bSegments = getSegments(b);
  let common = 0;
  while (common < aSegments.length && common < bSegments.length && aSegments[common] === bSegments[common]) {
    common++;
  }
  return (aSegments.length - common) + (bSegments.length - common);
}

export function pathDepth(path: string): number {
  return getSegments(path).length;
}

export function sortByDepth(paths: string[]): string[] {
  return paths.sort((a, b) => pathDepth(a) - pathDepth(b));
}

export function groupByDepth(paths: string[]): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const path of paths) {
    const depth = pathDepth(path);
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth)!.push(path);
  }
  return groups;
}

export function sortByType(paths: string[]): { files: string[]; directories: string[] } {
  const files: string[] = [];
  const directories: string[] = [];
  for (const path of paths) {
    if (path.endsWith("/")) {
      directories.push(path);
    } else {
      files.push(path);
    }
  }
  return { files, directories };
}

export function filterByExt(paths: string[], ext: string): string[] {
  return paths.filter((path) => hasExt(path, ext));
}

export function filterByPattern(paths: string[], pattern: string): string[] {
  const regex = typeof pattern === "string" ? globToRegex(pattern) : pattern;
  return paths.filter((path) => regex.test(path));
}

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = normalizePath(path);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(path);
    }
  }
  return result;
}

export function deduplicatePaths(paths: string[]): string[] {
  return uniquePaths(paths);
}

export function mergePaths(...pathArrays: string[][]): string[] {
  return uniquePaths(pathArrays.flat());
}

export function intersectPaths(a: string[], b: string[]): string[] {
  const set = new Set(a.map(normalizePath));
  return b.filter((path) => set.has(normalizePath(path)));
}

export function diffPaths(a: string[], b: string[]): string[] {
  const set = new Set(b.map(normalizePath));
  return a.filter((path) => !set.has(normalizePath(path)));
}

export function buildTree(paths: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const path of paths) {
    const segments = getSegments(path);
    let current = root;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (i === segments.length - 1) {
        current[segment] = null;
      } else {
        if (!(segment in current)) {
          current[segment] = {};
        }
        current = current[segment] as Record<string, unknown>;
      }
    }
  }
  return root;
}

export function flattenTree(tree: Record<string, unknown>, prefix: string = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}/${key}` : key;
    if (value === null) {
      paths.push(path);
    } else if (typeof value === "object" && value !== null) {
      paths.push(...flattenTree(value as Record<string, unknown>, path));
    }
  }
  return paths;
}
