/** Asynchronous file system operations. */

import { join, dirname, extname } from "node:path";
import { getFs } from "./runtime-compat";
import { getFsPromises } from "./runtime-compat";
import { MIME_TYPES } from "../constants/misc";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}



function safeJsonParse(json, fallback) {
  try { return JSON.parse(json); }
  catch { return fallback; }
}



export function readFileSync(path: string): string {
  const fs = getFs();
  return fs.readFileSync(path, "utf-8");
}

export async function readFile(path: string): Promise<string> {
  const fsp = getFsPromises();
  return await fsp.readFile(path, "utf-8");
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const fsp = getFsPromises();
  const buf = await fsp.readFile(path);
  return new Uint8Array(buf);
}

export function writeFileSync(path: string, content: string | Uint8Array): void {
  const fs = getFs();
  fs.writeFileSync(path, content);
}

export function existsSync(path: string): boolean {
  const fs = getFs();
  try {
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

export function statSync(path: string): { size: number; mtime: number; isFile: boolean; isDir: boolean } {
  const fs = getFs();
  const stat = fs.statSync(path);
  return {
    size: stat.size,
    mtime: stat.mtimeMs,
    isFile: stat.isFile(),
    isDir: stat.isDirectory(),
  };
}

export async function mkdirp(path: string): Promise<void> {
  const fsp = getFsPromises();
  await fsp.mkdir(path, { recursive: true });
}

export function removeSync(path: string): void {
  const fs = getFs();
  try {
    fs.rmSync(path, { recursive: true, force: true });
  } catch {
    // Already removed
  }
}

export function copyFileSync(src: string, dest: string): void {
  const fs = getFs();
  fs.copyFileSync(src, dest);
}

export function renameSync(oldPath: string, newPath: string): void {
  const fs = getFs();
  fs.renameSync(oldPath, newPath);
}

export function readdirSync(path: string): string[] {
  const fs = getFs();
  return fs.readdirSync(path);
}

export function chmodSync(path: string, mode: number): void {
  const fs = getFs();
  fs.chmodSync(path, mode);
}

// --- Async Operations ---------------------------------------------------------

export async function atomicWrite(path: string, content: string | Uint8Array): Promise<void> {
  const fsp = getFsPromises();
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdirp(dirname(path));
  await fsp.writeFile(tmpPath, content);
  await fsp.rename(tmpPath, path);
}

export function globMatch(pattern: string, path: string): boolean {
  // Convert glob to regex
  let regex = "^";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // ** -- match any path
        regex += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        // * -- match within a path segment
        regex += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regex += "[^/]";
      i++;
    } else if (ch === "[") {
      // Character class
      let classStr = "[";
      i++;
      while (i < pattern.length && pattern[i] !== "]") {
        classStr += pattern[i];
        i++;
      }
      classStr += "]";
      regex += classStr;
      i++;
    } else if (ch === "{") {
      // Alternation: {js,ts} -> (js|ts)
      let alts: string[] = [];
      let current = "";
      i++;
      while (i < pattern.length && pattern[i] !== "}") {
        if (pattern[i] === ",") {
          alts.push(current);
          current = "";
        } else {
          current += pattern[i];
        }
        i++;
      }
      alts.push(current);
      regex += `(${alts.join("|")})`;
      i++;
    } else {
      const escaped = ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      regex += escaped;
      i++;
    }
  }

  regex += "$";
  return new RegExp(escapeRegExp(regex)).test(path);
}

export async function readJSON<T = any>(path: string): Promise<T> {
  const content = await readFile(path);
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse JSON: ${path}`);
  }
}

export async function writeJSON(path: string, data: any, pretty: boolean = true): Promise<void> {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await atomicWrite(path, json);
}

export function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export function isBinary(path: string): boolean {
  const ext = extname(path).toLowerCase();
  const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
    ".ico", ".bmp", ".woff", ".woff2", ".ttf", ".otf", ".pdf",
    ".zip", ".gz", ".tar", ".mp4", ".webm", ".mp3", ".ogg", ".wav",
    ".wasm"];
  return binaryExts.includes(ext);
}

export function fileSizeStr(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export async function copyDir(src: string, dest: string): Promise<void> {
  const fsp = getFsPromises();
  await mkdirp(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

export async function tempFile(ext: string = ".tmp"): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const os = (globalThis as any).require?.("node:os");
  const tmpDir = os?.tmpdir?.() ?? "/tmp";
  const path = join(tmpDir, `tw_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  return {
    path,
    cleanup: async () => { try { await getFsPromises().unlink(path); } catch { /* already gone */ } },
  };
}

export async function readOr<T>(path: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(path);
    return content as unknown as T;
  } catch {
    return fallback;
  }
}

