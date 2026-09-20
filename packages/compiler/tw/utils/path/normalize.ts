/** Path normalization utilities. */

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .replace(/^\.\//, "");
}

export function normalizeSeparators(path: string, sep: string = "/"): string {
  return path.replace(/[/\\]/g, sep);
}

export function toUnixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

export function isRelativePath(path: string): boolean {
  return !isAbsolutePath(path);
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

export function ensureTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : path + "/";
}

export function removeTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : "/" + path;
}

export function removeLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

export function splitPath(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

export function splitExt(path: string): { dir: string; name: string; ext: string } {
  const normalized = normalizePath(path);
  const slashIdx = normalized.lastIndexOf("/");
  const dir = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ".";
  const filename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized;
  const dotIdx = filename.lastIndexOf(".");
  const name = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx >= 0 ? filename.slice(dotIdx) : "";
  return { dir, name, ext };
}
