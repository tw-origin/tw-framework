/**
 * AES Encryption -- AES-GCM encryption and decryption using
 * the Web Crypto API. Provides authenticated encryption with
 * associated data (AEAD).
 *
 * @module security/encryption/aes
 */

/** Encryption result. */
export interface EncryptionResult {
  ciphertext: string;
  iv: string;
  tag: string;
  algorithm: string;
}

/** AES key material. */
export interface AESKeyMaterial {
  key: CryptoKey;
  raw: Uint8Array;
}

/** Configuration for AES encryption. */
export interface AESConfig {
  keyLength?: 128 | 192 | 256;
  ivLength?: number;
  tagLength?: number;
}

/** Converts a string to a Uint8Array. */
function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Converts a Uint8Array to a base64 string. */
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Converts a base64 string to a Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * AES-GCM Encryption -- provides authenticated encryption
 * using AES in Galois/Counter Mode.
 */
export class AESEncryption {
  private keyLength: 128 | 192 | 256;
  private ivLength: number;
  private tagLength: number;
  private cachedKey: CryptoKey | null = null;
  private cachedRawKey: Uint8Array | null = null;

  constructor(config: AESConfig = {}) {
    this.keyLength = config.keyLength ?? 256;
    this.ivLength = config.ivLength ?? 12;
    this.tagLength = config.tagLength ?? 128;
  }

  /** Generates a new random AES key. */
  async generateKey(): Promise<AESKeyMaterial> {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: this.keyLength },
      true,
      ["encrypt", "decrypt"]
    );

    const raw = await crypto.subtle.exportKey("raw", key);
    const rawBytes = new Uint8Array(raw);

    return { key, raw: rawBytes };
  }

  /** Imports a key from raw bytes or a base64 string. */
  async importKey(rawKey: Uint8Array | string): Promise<CryptoKey> {
    const keyBytes = typeof rawKey === "string"
      ? base64ToBytes(rawKey)
      : rawKey;

    return crypto.subtle.importKey(
      "raw",
      keyBytes as any,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /** Encrypts plaintext using AES-GCM. */
  async encrypt(
    plaintext: string,
    key: CryptoKey,
    additionalData?: string
  ): Promise<EncryptionResult> {
    const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    const encoded = strToBytes(plaintext);
    const aad = additionalData ? strToBytes(additionalData) : undefined;

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        ...(aad ? { additionalData: aad as any } : {}),
        tagLength: this.tagLength,
      },
      key,
      encoded as any
    );

    const ctBytes = new Uint8Array(ciphertext);
    const ctLength = ctBytes.length - (this.tagLength / 8);
    const ct = ctBytes.slice(0, ctLength);
    const tag = ctBytes.slice(ctLength);

    return {
      ciphertext: bytesToBase64(ct),
      iv: bytesToBase64(iv),
      tag: bytesToBase64(tag),
      algorithm: "AES-GCM-" + this.keyLength,
    };
  }

  /** Decrypts ciphertext using AES-GCM. */
  async decrypt(
    result: EncryptionResult,
    key: CryptoKey,
    additionalData?: string
  ): Promise<string> {
    const iv = base64ToBytes(result.iv);
    const ct = base64ToBytes(result.ciphertext);
    const tag = base64ToBytes(result.tag);
    const aad = additionalData ? strToBytes(additionalData) : undefined;

    // Combine ciphertext and tag (Web Crypto expects them concatenated)
    const combined = new Uint8Array(ct.length + tag.length);
    combined.set(ct, 0);
    combined.set(tag, ct.length);

    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv as any,
          ...(aad ? { additionalData: aad as any } : {}),
          tagLength: this.tagLength,
        },
        key,
        combined
      );

      return new TextDecoder().decode(plaintext);
    } catch {
      throw new Error("Decryption failed -- invalid key, IV, or tampered data");
    }
  }

  /** Encrypts and returns a single self-contained string (iv.ciphertext.tag). */
  async encryptString(plaintext: string, key: CryptoKey): Promise<string> {
    const result = await this.encrypt(plaintext, key);
    return `${result.iv}.${result.ciphertext}.${result.tag}`;
  }

  /** Decrypts a self-contained string (iv.ciphertext.tag). */
  async decryptString(encoded: string, key: CryptoKey): Promise<string> {
    const [iv, ciphertext, tag] = encoded.split(".");
    if (!iv || !ciphertext || !tag) {
      throw new Error("Invalid encrypted string format");
    }
    return this.decrypt({ ciphertext, iv, tag, algorithm: "AES-GCM" }, key);
  }

  /** Derives a key from a password using PBKDF2. */
  async deriveKeyFromPassword(
    password: string,
    salt: string,
    iterations: number = 100000
  ): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      strToBytes(password) as any,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: strToBytes(salt) as any,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: this.keyLength },
      false,
      ["encrypt", "decrypt"]
    );
  }
}

/** Creates a new AES encryption instance. */
export function createAESEncryption(config?: AESConfig): AESEncryption {
  return new AESEncryption(config);
}
