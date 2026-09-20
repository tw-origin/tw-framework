/** File watching utilities. */

import { join } from "node:path";
import { existsSync } from "./sync";
import { getFs } from "./runtime-compat";
import type { WatchEvent } from "./sync";
import type { WatchOptions } from "./sync";

export function watch(
  path: string,
  callback: (event: WatchEvent) => void,
  opts?: WatchOptions,
): { close: () => void } {
  const fs = getFs();
  const exclude = opts?.exclude ?? ["node_modules", ".git", "dist", ".tw-cache"];
  const recursive = opts?.recursive ?? true;

  const watcher = fs.watch(path, { recursive }, (eventType: string, filename: string | Buffer) => {
    const name = typeof filename === "string" ? filename : new TextDecoder().decode(filename);
    const fullPath = join(path, name);

    if (exclude.some(pattern => fullPath.includes(pattern))) return;

    let type: WatchEvent["type"] = "modify";
    if (eventType === "rename") {
      type = existsSync(fullPath) ? "create" : "delete";
    }

    callback({
      type,
      path: fullPath,
      timestamp: Date.now(),
    });
  });

  return {
    close: () => watcher.close(),
  };
}

// --- JSON / YAML / TOML ------------------------------------------------------

