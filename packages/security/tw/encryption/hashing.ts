/**
 * Hashing Utilities -- SHA-1, SHA-256, SHA-384, SHA-512, and
 * HMAC-SHA256 using the Web Crypto API.
 *
 * @module security/encryption/hashing
 */

/** Supported hash algorithms. */
export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

/** Converts bytes to hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Converts bytes to base64. */
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Converts string to bytes. */
function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Hashing Utilities -- provides hash and HMAC functions
 * using the Web Crypto API.
 */
export class Hashing {
  /** Computes a hash of the input string. */
  static async hash(input: string, algorithm: HashAlgorithm = "SHA-256"): Promise<string> {
    const data = strToBytes(input);
    const hashBuffer = await crypto.subtle.digest(algorithm, data as any);
    return bytesToHex(new Uint8Array(hashBuffer));
  }

  /** Computes a hash and returns it as base64. */
  static async hashBase64(input: string, algorithm: HashAlgorithm = "SHA-256"): Promise<string> {
    const data = strToBytes(input);
    const hashBuffer = await crypto.subtle.digest(algorithm, data as any);
    return bytesToBase64(new Uint8Array(hashBuffer));
  }

  /** Computes a hash and returns it as bytes. */
  static async hashBytes(input: string | Uint8Array, algorithm: HashAlgorithm = "SHA-256"): Promise<Uint8Array> {
    const data = typeof input === "string" ? strToBytes(input) : input;
    const hashBuffer = await crypto.subtle.digest(algorithm, data as any);
    return new Uint8Array(hashBuffer);
  }

  /** Computes an HMAC. */
  static async hmac(
    key: string,
    message: string,
    algorithm: HashAlgorithm = "SHA-256"
  ): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      strToBytes(key) as any,
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      strToBytes(message) as any
    );

    return bytesToHex(new Uint8Array(signature));
  }

  /** Computes an HMAC and returns it as base64. */
  static async hmacBase64(
    key: string,
    message: string,
    algorithm: HashAlgorithm = "SHA-256"
  ): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      strToBytes(key) as any,
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      strToBytes(message) as any
    );

    return bytesToBase64(new Uint8Array(signature));
  }

  /** Verifies an HMAC (constant-time comparison). */
  static async verifyHmac(
    key: string,
    message: string,
    expectedHmac: string,
    algorithm: HashAlgorithm = "SHA-256"
  ): Promise<boolean> {
    const computed = await this.hmac(key, message, algorithm);
    if (computed.length !== expectedHmac.length) return false;
    let result = 0;
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
    }
    return result === 0;
  }

  /** SHA-256 shortcut. */
  static async sha256(input: string): Promise<string> {
    return this.hash(input, "SHA-256");
  }

  /** SHA-512 shortcut. */
  static async sha512(input: string): Promise<string> {
    return this.hash(input, "SHA-512");
  }

  /** SHA-1 shortcut (legacy, use SHA-256+ for security). */
  static async sha1(input: string): Promise<string> {
    return this.hash(input, "SHA-1");
  }

  /** Generates a random token of the specified length. */
  static randomToken(length: number = 32): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  /** Generates a random UUID v4. */
  static uuid(): string {
    return crypto.randomUUID();
  }

  /** Derives a key using PBKDF2. */
  static async pbkdf2(
    password: string,
    salt: string,
    iterations: number = 100000,
    keyLength: number = 256,
    algorithm: HashAlgorithm = "SHA-256"
  ): Promise<string> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      strToBytes(password) as any,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: strToBytes(salt) as any,
        iterations,
        hash: algorithm,
      },
      keyMaterial,
      keyLength
    );

    return bytesToHex(new Uint8Array(derivedBits));
  }

  /** Creates a hash with a salt (for password-like hashing). */
  static async saltedHash(input: string, salt: string, algorithm: HashAlgorithm = "SHA-256"): Promise<string> {
    return this.hash(salt + input, algorithm);
  }
}

/** Convenience function for SHA-256 hashing. */
export async function sha256(input: string): Promise<string> {
  return Hashing.sha256(input);
}

/** Convenience function for HMAC-SHA256. */
export async function hmacSha256(key: string, message: string): Promise<string> {
  return Hashing.hmac(key, message, "SHA-256");
}

/** Convenience function for random token generation. */
export function randomToken(length?: number): string {
  return Hashing.randomToken(length);
}
