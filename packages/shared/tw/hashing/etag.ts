/** ETag generation and content fingerprinting. */

import { md5 } from "./md5";
import { sha256, sha256Async, sha384, sha512 } from "./sha";


export function computeETag(data: string | Uint8Array, weak: boolean = false): string {
  const hash = md5(typeof data === "string" ? data : new TextDecoder().decode(data));
  const tag = `"${hash}"`;
  return weak ? `W/${tag}` : tag;
}

export function computeETagStrong(data: string | Uint8Array): string {
  return computeETag(data, false);
}

export function computeETagWeak(data: string | Uint8Array): string {
  return computeETag(data, true);
}

export function compareETags(etag1: string, etag2: string): boolean {
  const normalize = (e: string) => e.replace(/^W\//, "").replace(/"/g, "&quot;");
  return normalize(etag1) === normalize(etag2);
}



export interface Fingerprint {
  hash: string;
  algorithm: string;
  size: number;
  contentType: string;
}

export async function fingerprint(
  data: string | Uint8Array,
  algorithm: "sha256" | "sha384" | "sha512" = "sha256",
): Promise<Fingerprint> {
  const hashFns: Record<string, (d: string | Uint8Array) => Promise<string>> = {
    sha256: sha256Async,
    sha384: sha384,
    sha512: sha512,
  };
  const hash = await hashFns[algorithm](data);
  const size = typeof data === "string" ? new TextEncoder().encode(data).length : data.length;

  return {
    hash,
    algorithm,
    size,
    contentType: "application/octet-stream",
  };
}

export function contentHash(data: string | Uint8Array): string {
  const hash = sha256(data);
  return hash.slice(0, 16);
}

export function shortHash(data: string | Uint8Array, length: number = 8): string {
  return sha256(data).slice(0, length);
}

export function hashFile(filePath: string, content: string): string {
  // Content-addressed hash: includes file path to avoid collisions
  return sha256(`${filePath}:${content}`).slice(0, 16);
}

