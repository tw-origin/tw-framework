/** Glob pattern matching and directory walking. */

import { join } from "node:path";
import { getFsPromises } from "./runtime-compat";
import type { WalkOptions } from "./sync";
import { extname } from "../../../runtime/tw/utils/path-utils";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export async function walk(dir: string, opts?: WalkOptions): Promise<string[]> {
  const maxDepth = opts?.maxDepth ?? Infinity;
  const includeDirs = opts?.includeDirs ?? false;
  const includeFiles = opts?.includeFiles ?? true;
  const extensions = opts?.extensions;
  const exclude = opts?.exclude ?? ["node_modules", ".git", "dist", ".next", ".tw-cache"];
  const excludeDirs = opts?.excludeDirs ?? ["node_modules", ".git", "dist", ".tw-cache"];
  const results: string[] = [];

  async function walkDir(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const fsp = getFsPromises();
    let entries: any[];
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (excludeDirs.includes(entry.name)) continue;
        if (includeDirs) results.push(fullPath);
        await walkDir(fullPath, depth + 1);
      } else if (entry.isFile() && includeFiles) {
        if (extensions && !extensions.includes(extname(entry.name))) continue;
        if (exclude.some(pattern => fullPath.includes(pattern))) continue;
        results.push(fullPath);
      }
    }
  }

  await walkDir(dir, 0);
  return results;
}

