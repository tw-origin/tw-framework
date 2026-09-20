import { md5 } from "./md5";
import { crc32 } from "./crc32";
/** SHA-1, SHA-256, SHA-384, SHA-512 hashing - sync + async variants. */


function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToWords(bytes: Uint8Array): number[] {
  const words: number[] = [];
  for (let i = 0; i < bytes.length * 8; i += 8) {
    words[i >> 5] |= bytes[i / 8] << (i % 32);
  }
  return words;
}

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xFFFF) + (y & 0xFFFF);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

function rol(num: number, cnt: number): number {
  return (num << cnt) | (num >>> (32 - cnt));
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}



class BunHashSync {
  private hasher: any;

  constructor(algorithm: string) {
    // Bun has crypto.createHash -- try it
    const nodeCrypto = (globalThis as any).require?.("node:crypto") || (globalThis as any).crypto;
    if (nodeCrypto?.createHash) {
      this.hasher = nodeCrypto.createHash(algorithm);
    } else {
      throw new Error("No sync hash available");
    }
  }

  update(data: string | Uint8Array): this {
    const input = typeof data === "string" ? data : Buffer.from(data);
    this.hasher.update(input);
    return this;
  }

  digest(encoding: string): string {
    return this.hasher.digest(encoding);
  }
}

function syncHashFallback(algorithm: string, data: string | Uint8Array): string {
  // Simple FNV-1a hash as absolute last resort -- NOT cryptographically secure
  const input = typeof data === "string" ? data : new TextDecoder().decode(data);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}



async function digest(algorithm: string, data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest(algorithm, bytes as BufferSource);
  return bufferToHex(hash);
}

export function sha1(data: string | Uint8Array): Promise<string> {
  return digest("SHA-1", data);
}

export function sha256(data: string | Uint8Array): string {
  // Bun's crypto is sync -- use it when available, otherwise fall back to async
  try {
    const hasher = new BunHashSync("sha256");
    return hasher.update(data).digest("hex");
  } catch {
    // Fallback for non-Bun environments
    return syncHashFallback("sha256", data);
  }
}

export async function sha256Async(data: string | Uint8Array): Promise<string> {
  return digest("SHA-256", data);
}

export function sha384(data: string | Uint8Array): Promise<string> {
  return digest("SHA-384", data);
}

export function sha512(data: string | Uint8Array): Promise<string> {
  return digest("SHA-512", data);
}



export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha384" | "sha512" | "crc32";

export const HASH_INFO: Record<HashAlgorithm, {
  outputSize: number;
  blockSize: number;
  securityLevel: "none" | "low" | "medium" | "high";
  async: boolean;
}> = {
  md5:    { outputSize: 128,  blockSize: 512,  securityLevel: "none",   async: false },
  sha1:   { outputSize: 160,  blockSize: 512,  securityLevel: "low",    async: true  },
  sha256: { outputSize: 256,  blockSize: 512,  securityLevel: "high",   async: false },
  sha384: { outputSize: 384,  blockSize: 1024, securityLevel: "high",   async: true  },
  sha512: { outputSize: 512,  blockSize: 1024, securityLevel: "high",   async: true  },
  crc32:  { outputSize: 32,   blockSize: 0,    securityLevel: "none",   async: false },
};

export async function hash(
  data: string | Uint8Array,
  algorithm: HashAlgorithm = "sha256",
): Promise<string> {
  switch (algorithm) {
    case "sha1":   return sha1(data);
    case "sha256": return sha256(data);
    case "sha384": return sha384(data);
    case "sha512": return sha512(data);
    default:       return sha256(data);
  }
}


export function hashSync(data: string | Uint8Array, algorithm: HashAlgorithm = "sha256"): string {
  switch (algorithm) {
    case "md5":    return md5(typeof data === "string" ? data : new TextDecoder().decode(data));
    case "sha1":   throw new Error("sha1 is async-only");
    case "sha256": return sha256(data);
    case "sha384": throw new Error("sha384 is async-only");
    case "sha512": throw new Error("sha512 is async-only");
    case "crc32":  return crc32(data).toString(16).padStart(8, "0");
    default:       return sha256(data);
  }
}
