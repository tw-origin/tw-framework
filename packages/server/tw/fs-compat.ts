/**
 * Runtime-neutral file and compression helpers.
 *
 * `Bun.file(...)` and `Bun.gzipSync(...)` are Bun-only -- on Node they throw
 * `ReferenceError: Bun is not defined`, which made parts of the server Bun-only
 * by accident. Everything the server does has to work on both runtimes, so these
 * use Bun's fast path when it is present and fall back to `node:fs` / `node:zlib`
 * otherwise.
 */
import { readFile } from "node:fs/promises";
import { gzipSync as zlibGzipSync } from "node:zlib";

const BUN = (globalThis as { Bun?: any }).Bun;

/** Read a file as UTF-8 text on Bun or Node. */
export async function readTextFile(path: string): Promise<string> {
  if (BUN?.file) return await BUN.file(path).text();
  return await readFile(path, "utf-8");
}

/** Read a file as bytes on Bun or Node. */
export async function readBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  if (BUN?.file) return new Uint8Array(await BUN.file(path).arrayBuffer());
  return new Uint8Array(await readFile(path));
}

/** gzip bytes on Bun or Node (same result, whichever runtime is available). */
export function gzipBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (BUN?.gzipSync) return BUN.gzipSync(bytes) as Uint8Array<ArrayBuffer>;
  return zlibGzipSync(bytes);
}
