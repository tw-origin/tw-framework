/** Cache key generation -- content-addressed keys for compiled output. */

import { sha256 } from "@tw/shared";

export function makeKey(filePath: string, source: string): string {
  return sha256(`${filePath}:${source}`).slice(0, 16);
}

export function makeFileKey(filePath: string, mtime: number, size: number): string {
  return sha256(`${filePath}:${mtime}:${size}`).slice(0, 16);
}

export function makeSourceKey(source: string): string {
  return sha256(source).slice(0, 16);
}

export function makeConfigKey(config: any): string {
  return sha256(JSON.stringify(config)).slice(0, 16);
}
