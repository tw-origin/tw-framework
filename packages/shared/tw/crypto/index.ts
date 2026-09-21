import { createHash } from "node:crypto";
/**
 * Cryptographic utilities -- hashing, encryption, random, key derivation.
 * @module shared/crypto
 */

export type HashAlgorithm = "md5" | "sha1" | "sha224" | "sha256" | "sha384" | "sha512";

export interface HashOptions {
  encoding?: "hex" | "base64" | "binary" | "utf8";
  salt?: string;
  iterations?: number;
}

export interface EncryptionOptions {
  algorithm?: string;
  key?: string;
  iv?: string;
  salt?: string;
  padding?: boolean;
}

export interface KeyDerivationOptions {
  algorithm?: "pbkdf2" | "scrypt" | "bcrypt";
  salt?: string;
  iterations?: number;
  keyLength?: number;
  hashAlgorithm?: HashAlgorithm;
}

export function hashSimple(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

export function hashString(str: string): string {
  return Math.abs(hashSimple(str)).toString(16);
}

export function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}

export function sdbmHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + (hash << 6) + (hash << 16) - hash;
    hash = hash & hash;
  }
  return hash;
}

export function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function murmurhash3(key: string, seed: number = 0): number {
  const remainder = key.length & 3;
  const bytes = key.length - remainder;
  let h1 = seed;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let i = 0;
  while (i < bytes) {
    let k1 = (key.charCodeAt(i) & 0xff) | ((key.charCodeAt(++i) & 0xff) << 8) | ((key.charCodeAt(++i) & 0xff) << 16) | ((key.charCodeAt(++i) & 0xff) << 24);
    ++i;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }
  let k1 = 0;
  switch (remainder) {
    case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    case 1: k1 ^= key.charCodeAt(i) & 0xff;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

export function crc32(str: string): number {
  let crc = 0xffffffff;
  const table = crc32Table();
  for (let i = 0; i < str.length; i++) {
    crc = table[(crc ^ str.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Table(): number[] {
  const table: number[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
}

export async function hashWithWebCrypto(algorithm: HashAlgorithm, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha384(data: string): string {
  return createHash("sha384").update(data).digest("hex");
}

export function sha512(data: string): string {
  return createHash("sha512").update(data).digest("hex");
}

export function sha1(data: string): string {
  return createHash("sha1").update(data).digest("hex");
}

export async function md5(data: string): Promise<string> {
  return hashWithWebCrypto("md5" as HashAlgorithm, data);
}

export async function hmac(data: string, key: string, algorithm: HashAlgorithm = "sha256"): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: algorithm }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pbkdf2(password: string, salt: string, iterations: number = 100000, keyLength: number = 256): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations, hash: "sha256" },
    keyMaterial,
    keyLength,
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deriveKey(password: string, salt: string, options: KeyDerivationOptions = {}): Promise<CryptoKey> {
  const { iterations = 100000, keyLength = 256 } = options;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations, hash: "sha256" },
    keyMaterial,
    { name: "AES-GCM", length: keyLength },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptAES(data: string, key: CryptoKey, iv?: Uint8Array): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const ivBytes = iv ?? crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes as BufferSource }, key, dataBuffer);
  return { encrypted, iv: ivBytes };
}

export async function decryptAES(encrypted: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<string> {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, encrypted);
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function encryptString(data: string, password: string, salt: string): Promise<string> {
  const key = await deriveKey(password, salt);
  const { encrypted, iv } = await encryptAES(data, key);
  const encryptedArray = Array.from(new Uint8Array(encrypted));
  const ivArray = Array.from(iv);
  return `${ivArray.map((b) => b.toString(16).padStart(2, "0")).join("")}:${encryptedArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function decryptString(encryptedData: string, password: string, salt: string): Promise<string> {
  const [ivHex, dataHex] = encryptedData.split(":");
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const encrypted = new Uint8Array(dataHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))).buffer as ArrayBuffer;
  const key = await deriveKey(password, salt);
  return decryptAES(encrypted, key, iv);
}

export async function generateRSAKeyPair(bits: number = 2048): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: "sha256" },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptRSA(data: string, publicKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encoder.encode(data));
  return Array.from(new Uint8Array(encrypted)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function decryptRSA(encryptedHex: string, privateKey: CryptoKey): Promise<string> {
  const encrypted = new Uint8Array(encryptedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const decrypted = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encrypted);
  return new TextDecoder().decode(decrypted);
}

export async function signData(data: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySignature(data: string, signatureHex: string, publicKey: CryptoKey): Promise<boolean> {
  const encoder = new TextEncoder();
  const signature = new Uint8Array(signatureHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, publicKey, signature, encoder.encode(data));
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const maxUint32 = 0xffffffff;
  const maxValid = maxUint32 - (maxUint32 % range);
  const array = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value > maxValid);
  return min + (value % range);
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function randomString(length: number, charset: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"): string {
  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    result.push(charset[randomInt(0, charset.length - 1)]);
  }
  return result.join("");
}

export function randomHex(length: number): string {
  return randomString(length, "0123456789abcdef");
}

export function randomBase64(length: number): string {
  const bytes = randomBytes(length);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function randomToken(length: number = 32): string {
  return randomHex(length);
}

export function randomSalt(length: number = 16): string {
  return randomHex(length);
}

export function generateApiKey(prefix: string = "tw", length: number = 32): string {
  return `${prefix}_${randomHex(length)}`;
}

export function generateSecret(length: number = 64): string {
  return randomHex(length);
}

export function generateOTP(length: number = 6): string {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += randomInt(0, 9).toString();
  }
  return otp;
}

export function generatePIN(length: number = 4): string {
  return generateOTP(length);
}

export async function generateTOTP(secret: string, timestamp: number = Date.now(), step: number = 30, digits: number = 6): Promise<string> {
  const counter = Math.floor(timestamp / 1000 / step);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(4, counter);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "sha1" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, counterBuffer);
  const hashArray = new Uint8Array(signature);
  let offset = hashArray[hashArray.length - 1] & 0x0f;
  let binary = ((hashArray[offset] & 0x7f) << 24) | ((hashArray[offset + 1] & 0xff) << 16) | ((hashArray[offset + 2] & 0xff) << 8) | (hashArray[offset + 3] & 0xff);
  return (binary % Math.pow(10, digits)).toString().padStart(digits, "0");
}

export async function verifyTOTP(token: string, secret: string, window: number = 1): Promise<boolean> {
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const expected = await generateTOTP(secret, now + i * 30000);
    if (token === expected) return true;
  }
  return false;
}

export function base64Encode(str: string): string {
  if (typeof btoa !== "undefined") return btoa(str);
  if (typeof Buffer !== "undefined") return Buffer.from(str, "utf-8").toString("base64");
  return str;
}

export function base64Decode(str: string): string {
  if (typeof atob !== "undefined") return atob(str);
  if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
  return str;
}

export function base64UrlEncode(str: string): string {
  return base64Encode(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return base64Decode(padded + padding);
}

export function hexEncode(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return result;
}

export function hexDecode(hex: string): string {
  let result = "";
  for (let i = 0; i < hex.length; i += 2) {
    result += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return result;
}

export function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function xorStrings(a: string, b: string): string {
  const result: string[] = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const charA = a.charCodeAt(i % a.length) || 0;
    const charB = b.charCodeAt(i % b.length) || 0;
    result.push(String.fromCharCode(charA ^ charB));
  }
  return result.join("");
}

export function caesarCipher(str: string, shift: number): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + shift) % 26 + 26) % 26 + base);
  });
}

export function rot13(str: string): string {
  return caesarCipher(str, 13);
}

export function atbash(str: string): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(25 - (char.charCodeAt(0) - base) + base);
  });
}

export function vigenereEncrypt(str: string, key: string): string {
  let result = "";
  let keyIndex = 0;
  for (const char of str) {
    if (/[a-zA-Z]/.test(char)) {
      const base = char <= "Z" ? 65 : 97;
      const shift = key.charCodeAt(keyIndex % key.length) - (key[keyIndex % key.length] <= "Z" ? 65 : 97);
      result += String.fromCharCode(((char.charCodeAt(0) - base + shift) % 26 + 26) % 26 + base);
      keyIndex++;
    } else {
      result += char;
    }
  }
  return result;
}

export function vigenereDecrypt(str: string, key: string): string {
  let result = "";
  let keyIndex = 0;
  for (const char of str) {
    if (/[a-zA-Z]/.test(char)) {
      const base = char <= "Z" ? 65 : 97;
      const shift = key.charCodeAt(keyIndex % key.length) - (key[keyIndex % key.length] <= "Z" ? 65 : 97);
      result += String.fromCharCode(((char.charCodeAt(0) - base - shift) % 26 + 26) % 26 + base);
      keyIndex++;
    } else {
      result += char;
    }
  }
  return result;
}

export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("sha256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("sha256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function compareHashes(data: string, hash: string, algorithm: HashAlgorithm = "sha256"): Promise<boolean> {
  const computed = await hashWithWebCrypto(algorithm, data);
  return computed === hash;
}

export async function verifyPassword(password: string, hash: string, salt: string, iterations: number = 100000): Promise<boolean> {
  const computed = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(computed, hash);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function constantTimeCompare(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt ?? randomSalt(16);
  const hash = await pbkdf2(password, actualSalt, 100000);
  return { hash, salt: actualSalt };
}

export class CryptoManager {
  private keys: Map<string, CryptoKey> = new Map();

  async generateAESKey(keyLength: number = 256): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: keyLength }, true, ["encrypt", "decrypt"]);
  }

  async importAESKey(rawKey: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", rawKey as BufferSource, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }

  async exportKey(key: CryptoKey): Promise<Uint8Array> {
    const exported = await crypto.subtle.exportKey("raw", key);
    return new Uint8Array(exported);
  }

  storeKey(name: string, key: CryptoKey): void {
    this.keys.set(name, key);
  }

  getKey(name: string): CryptoKey | undefined {
    return this.keys.get(name);
  }

  removeKey(name: string): void {
    this.keys.delete(name);
  }

  async encrypt(data: string, keyName: string): Promise<string> {
    const key = this.keys.get(keyName);
    if (!key) throw new Error(`Key "${keyName}" not found`);
    const { encrypted, iv } = await encryptAES(data, key);
    const encryptedArray = Array.from(new Uint8Array(encrypted));
    const ivArray = Array.from(iv);
    return `${ivArray.map((b) => b.toString(16).padStart(2, "0")).join("")}:${encryptedArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  async decrypt(encryptedData: string, keyName: string): Promise<string> {
    const key = this.keys.get(keyName);
    if (!key) throw new Error(`Key "${keyName}" not found`);
    const [ivHex, dataHex] = encryptedData.split(":");
    const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
    const encrypted = new Uint8Array(dataHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))).buffer as ArrayBuffer;
    return decryptAES(encrypted, key, iv);
  }

  async hash(data: string, algorithm: HashAlgorithm = "sha256"): Promise<string> {
    return hashWithWebCrypto(algorithm, data);
  }

  async hmac(data: string, key: string, algorithm: HashAlgorithm = "sha256"): Promise<string> {
    return hmac(data, key, algorithm);
  }

  async hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    return hashPassword(password, salt);
  }

  async verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    return verifyPassword(password, hash, salt);
  }

  randomBytes(length: number): Uint8Array {
    return randomBytes(length);
  }

  randomString(length: number, charset?: string): string {
    return randomString(length, charset);
  }

  randomHex(length: number): string {
    return randomHex(length);
  }

  randomUUID(): string {
    return randomUUID();
  }

  clear(): void {
    this.keys.clear();
  }

  size(): number {
    return this.keys.size;
  }

  hasKey(name: string): boolean {
    return this.keys.has(name);
  }

  listKeys(): string[] {
    return [...this.keys.keys()];
  }
}

export function createCryptoManager(): CryptoManager {
  return new CryptoManager();
}

export function isCryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

export function getSupportedAlgorithms(): string[] {
  if (!isCryptoAvailable()) return [];
  return ["SHA-1", "SHA-256", "SHA-384", "SHA-512", "AES-GCM", "AES-CBC", "AES-CTR", "RSA-OAEP", "RSASSA-PKCS1-v1_5", "ECDSA", "HMAC", "PBKDF2"];
}

export function getSupportedKeyLengths(): number[] {
  return [128, 192, 256];
}

export function getSupportedHashAlgorithms(): HashAlgorithm[] {
  return ["sha1", "sha256", "sha384", "sha512"];
}

export async function digest(data: string, algorithm: HashAlgorithm = "sha256"): Promise<string> {
  return hashWithWebCrypto(algorithm, data);
}

export async function hashObject(obj: unknown, algorithm: HashAlgorithm = "sha256"): Promise<string> {
  return hashWithWebCrypto(algorithm, JSON.stringify(obj));
}

export async function hashFile(file: File, algorithm: HashAlgorithm = "sha256"): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashStream(stream: ReadableStream<Uint8Array>, algorithm: HashAlgorithm = "sha256"): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function compareFiles(file1: File, file2: File, algorithm: HashAlgorithm = "sha256"): Promise<boolean> {
  const hash1 = await hashFile(file1, algorithm);
  const hash2 = await hashFile(file2, algorithm);
  return timingSafeEqual(hash1, hash2);
}

export async function compareBuffers(buffer1: ArrayBuffer, buffer2: ArrayBuffer, algorithm: HashAlgorithm = "sha256"): Promise<boolean> {
  const hash1 = await sha256Buffer(buffer1);
  const hash2 = await sha256Buffer(buffer2);
  return timingSafeEqual(hash1, hash2);
}

export function generateNonce(length: number = 16): string {
  return randomHex(length);
}

export function generateChallenge(length: number = 32): string {
  return randomHex(length);
}

export async function generateProofOfKnowledge(secret: string, challenge: string): Promise<string> {
  return hmac(challenge, secret);
}

export async function verifyProofOfKnowledge(secret: string, challenge: string, proof: string): Promise<boolean> {
  const expected = await generateProofOfKnowledge(secret, challenge);
  return timingSafeEqual(expected, proof);
}

export function maskSensitiveData(data: string, visibleStart: number = 4, visibleEnd: number = 4): string {
  if (data.length <= visibleStart + visibleEnd) return "*".repeat(data.length);
  return data.slice(0, visibleStart) + "*".repeat(data.length - visibleStart - visibleEnd) + data.slice(-visibleEnd);
}

export function maskApiKey(key: string): string {
  return maskSensitiveData(key, 4, 4);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return maskSensitiveData(email, 1, 0);
  return maskSensitiveData(local, 1, 1) + "@" + domain;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return phone.slice(0, -4).replace(/\d/g, "*") + digits.slice(-4);
}

export function maskCreditCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length < 4) return card;
  return "*".repeat(digits.length - 4) + digits.slice(-4);
}

export function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length < 4) return ssn;
  return "***-**-" + digits.slice(-4);
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>"'&]/g, "");
}

export function sanitizeForSQL(input: string): string {
  return input.replace(/[';\-\-#\/\*]/g, "");
}

export function sanitizeForShell(input: string): string {
  return input.replace(/[;&|`$(){}\[\]!<>\n\r]/g, "");
}

export function sanitizeForHTML(input: string): string {
  return input.replace(/[<>&"']/g, (char) => {
    const entities: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"' : "&quot;", "'": "&#x27;" };
    return entities[char] ?? char;
  });
}

export function sanitizeForURL(input: string): string {
  return encodeURIComponent(input);
}

export function sanitizeForJSON(input: string): string {
  return input.replace(/[\\\"\n\r\t]/g, (char) => {
    const escapes: Record<string, string> = { "\\": "\\\\", '"': "\\\"", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
    return escapes[char] ?? char;
  });
}

export function sanitizeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeForXML(input: string): string {
  return input.replace(/[<>&"']/g, (char) => {
    const entities: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"' : "&quot;", "'": "&#x27;" };
    return entities[char] ?? char;
  });
}

export function sanitizeForCSS(input: string): string {
  return input.replace(/[<>]/g, "");
}

export function sanitizeForJS(input: string): string {
  return input.replace(/[<>"'\/]/g, "");
}

export function sanitizeForCommand(input: string): string {
  return sanitizeForShell(input);
}

export function sanitizeForLDAP(input: string): string {
  return input.replace(/[*()\\\x00]/g, "");
}

export function sanitizeForXPath(input: string): string {
  return input.replace(/['"]/g, "");
}

export function sanitizeForNoSQL(input: string): string {
  return input.replace(/[$.\{\}]/g, "");
}

export function sanitizeForTemplate(input: string): string {
  return input.replace(/[${}]/g, "");
}

export function sanitizeForPath(input: string): string {
  return input.replace(/\.\.[\/\\]/g, "");
}

export function sanitizeForFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function sanitizeForHeader(input: string): string {
  return input.replace(/[\r\n]/g, "");
}

export function sanitizeForCookie(input: string): string {
  return input.replace(/[;\s]/g, "");
}

export function sanitizeForLog(input: string): string {
  return input.replace(/[\r\n]/g, " ");
}

export function sanitizeForDisplay(input: string): string {
  return sanitizeForHTML(input);
}

export function sanitizeForAttribute(input: string): string {
  return input.replace(/["'<>&]/g, (char) => {
    const entities: Record<string, string> = { '"' : "&quot;", "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#x27;" };
    return entities[char] ?? char;
  });
}

export function sanitizeForJavaScript(input: string): string {
  return input.replace(/[<>"'\/]/g, (char) => {
    const escapes: Record<string, string> = { "<": "\x3C", ">": "\x3E", '"': "\x22", "'": "\x27", "\\": "\\\\", "/": "\\/" };
    return escapes[char] ?? char;
  });
}

export function sanitizeForDataURI(input: string): string {
  return encodeURIComponent(input);
}

export function sanitizeForBase64(input: string): string {
  return input.replace(/[^A-Za-z0-9+/=]/g, "");
}

export function sanitizeForHex(input: string): string {
  return input.replace(/[^0-9a-fA-F]/g, "");
}

export function sanitizeForBinary(input: string): string {
  return input.replace(/[^01]/g, "");
}

export function sanitizeForNumber(input: string): string {
  return input.replace(/[^0-9.\-]/g, "");
}

export function sanitizeForInteger(input: string): string {
  return input.replace(/[^0-9\-]/g, "");
}

export function sanitizeForFloat(input: string): string {
  return input.replace(/[^0-9.\-eE]/g, "");
}

export function sanitizeForBoolean(input: string): string {
  const lower = input.toLowerCase();
  if (lower === "true" || lower === "1") return "true";
  if (lower === "false" || lower === "0") return "false";
  return "";
}

export function sanitizeForDate(input: string): string {
  return input.replace(/[^0-9T:./\-Z+]/g, "");
}

export function sanitizeForTime(input: string): string {
  return input.replace(/[^0-9:]/g, "");
}

export function sanitizeForEmail(input: string): string {
  return input.replace(/[^a-zA-Z0-9@._+\-]/g, "");
}

export function sanitizeForPhone(input: string): string {
  return input.replace(/[^0-9+\-()\s]/g, "");
}

export function sanitizeForURLInput(input: string): string {
  return input.replace(/[^a-zA-Z0-9./%:?&=#\-_~+]/g, "");
}

export function sanitizeForDomain(input: string): string {
  return input.replace(/[^a-zA-Z0-9.\-]/g, "");
}

export function sanitizeForIPAddress(input: string): string {
  return input.replace(/[^0-9.:/]/g, "");
}

export function sanitizeForPort(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForUUID(input: string): string {
  return input.replace(/[^0-9a-fA-F\-]/g, "");
}

export function sanitizeForColor(input: string): string {
  return input.replace(/[^a-zA-Z0-9#(),\s%]/g, "");
}

export function sanitizeForLanguageCode(input: string): string {
  return input.replace(/[^a-zA-Z\-]/g, "");
}

export function sanitizeForCountryCode(input: string): string {
  return input.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
}

export function sanitizeForCurrency(input: string): string {
  return input.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
}

export function sanitizeForLocale(input: string): string {
  return input.replace(/[^a-zA-Z\-_]/g, "");
}

export function sanitizeForTimezone(input: string): string {
  return input.replace(/[^a-zA-Z/_\-+]/g, "");
}

export function sanitizeForMimeType(input: string): string {
  return input.replace(/[^a-zA-Z0-9./+\-]/g, "");
}

export function sanitizeForEncoding(input: string): string {
  return input.replace(/[^a-zA-Z0-9\-]/g, "").toLowerCase();
}

export function sanitizeForCharset(input: string): string {
  return input.replace(/[^a-zA-Z0-9\-_]/g, "").toLowerCase();
}

export function sanitizeForAlgorithm(input: string): string {
  return input.replace(/[^a-zA-Z0-9\-]/g, "").toLowerCase();
}

export function sanitizeForCipher(input: string): string {
  return input.replace(/[^a-zA-Z0-9\-]/g, "").toLowerCase();
}

export function sanitizeForHash(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function sanitizeForKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function sanitizeForIV(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function sanitizeForSalt(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function sanitizeForToken(input: string): string {
  return input.replace(/[^a-zA-Z0-9._\-]/g, "");
}

export function sanitizeForAPIKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9._\-]/g, "");
}

export function sanitizeForSecret(input: string): string {
  return input;
}

export function sanitizeForPassword(input: string): string {
  return input;
}

export function sanitizeForPIN(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForOTP(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForTOTP(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForBarcode(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForEAN(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForUPC(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForVIN(input: string): string {
  return input.replace(/[^a-hj-npr-zA-HJ-NPR-Z0-9]/g, "").toUpperCase();
}

export function sanitizeForIBAN(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function sanitizeForSWIFT(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function sanitizeForCreditCard(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForSSN(input: string): string {
  return input.replace(/[^0-9\-]/g, "");
}

export function sanitizeForZipCode(input: string): string {
  return input.replace(/[^0-9a-zA-Z \-]/g, "");
}

export function sanitizeForISBN(input: string): string {
  return input.replace(/[^0-9Xx\-]/g, "");
}

export function sanitizeForMAC(input: string): string {
  return input.replace(/[^0-9a-fA-F: \-]/g, "");
}

export function sanitizeForIPv4(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForIPv6(input: string): string {
  return input.replace(/[^0-9a-fA-F:]/g, "");
}

export function sanitizeForHexColor(input: string): string {
  return input.replace(/[^#0-9a-fA-F]/g, "");
}

export function sanitizeForRGB(input: string): string {
  return input.replace(/[^rgb0-9(),\s]/g, "");
}

export function sanitizeForRGBA(input: string): string {
  return input.replace(/[^rgba0-9().,\s]/g, "");
}

export function sanitizeForHSL(input: string): string {
  return input.replace(/[^hsl0-9%,.,\s()]/g, "");
}

export function sanitizeForSemver(input: string): string {
  return input.replace(/[^0-9.\-+a-zA-Z]/g, "");
}

export function sanitizeForJWT(input: string): string {
  return input.replace(/[^a-zA-Z0-9._\-]/g, "");
}

export function sanitizeForJSONInput(input: string): string {
  return input.replace(/[<>]/g, "");
}

export function sanitizeForBase64Input(input: string): string {
  return input.replace(/[^A-Za-z0-9+/=]/g, "");
}

export function sanitizeForHexInput(input: string): string {
  return input.replace(/[^0-9a-fA-F]/g, "");
}

export function sanitizeForBinaryInput(input: string): string {
  return input.replace(/[^01]/g, "");
}

export function sanitizeForNumberInput(input: string): string {
  return input.replace(/[^0-9.\-eE]/g, "");
}

export function sanitizeForIntegerInput(input: string): string {
  return input.replace(/[^0-9\-]/g, "");
}

export function sanitizeForFloatInput(input: string): string {
  return input.replace(/[^0-9.\-eE]/g, "");
}

export function sanitizeForBooleanInput(input: string): string {
  const lower = input.toLowerCase();
  if (lower.startsWith("t")) return "true";
  if (lower.startsWith("f")) return "false";
  if (lower === "1") return "true";
  if (lower === "0") return "false";
  return "";
}

export function sanitizeForDateInput(input: string): string {
  return input.replace(/[^0-9T:./\-Z+]/g, "");
}

export function sanitizeForTimeInput(input: string): string {
  return input.replace(/[^0-9:]/g, "");
}

export function sanitizeForDateTime(input: string): string {
  return input.replace(/[^0-9T:./\-Z+ ]/g, "");
}

export function sanitizeForTimestamp(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function sanitizeForDuration(input: string): string {
  return input.replace(/[^0-9.smhdwy]/g, "");
}

export function sanitizeForInterval(input: string): string {
  return input.replace(/[^0-9.smhdwy]/g, "");
}

export function sanitizeForFrequency(input: string): string {
  return input.replace(/[^0-9.kMGTGHz ]/g, "");
}

export function sanitizeForBitrate(input: string): string {
  return input.replace(/[^0-9.kMGTGbps ]/g, "");
}

export function sanitizeForVoltage(input: string): string {
  return input.replace(/[^0-9.mVk ]/g, "");
}

export function sanitizeForCurrent(input: string): string {
  return input.replace(/[^0-9.mAuA ]/g, "");
}

export function sanitizeForResistance(input: string): string {
  return input.replace(/[^0-9.kMohm ]/g, "");
}

export function sanitizeForCapacitance(input: string): string {
  return input.replace(/[^0-9.pnumF ]/g, "");
}

export function sanitizeForWatts(input: string): string {
  return input.replace(/[^0-9.mukW ]/g, "");
}

export function sanitizeForTemperature(input: string): string {
  return input.replace(/[^0-9.\-CFK ]/g, "");
}

export function sanitizeForAngle(input: string): string {
  return input.replace(/[^0-9.\-?'"dms ]/g, "");
}

export function sanitizeForDistance(input: string): string {
  return input.replace(/[^0-9.kmcm ]/g, "");
}

export function sanitizeForArea(input: string): string {
  return input.replace(/[^0-9.km?ha ]/g, "");
}

export function sanitizeForVolume(input: string): string {
  return input.replace(/[^0-9.Lm ]/g, "");
}

export function sanitizeForWeight(input: string): string {
  return input.replace(/[^0-9.kgmgt ]/g, "");
}

export function sanitizeForSpeed(input: string): string {
  return input.replace(/[^0-9.kmhms ]/g, "");
}

export function sanitizeForPressure(input: string): string {
  return input.replace(/[^0-9.Pab ]/g, "");
}

export function sanitizeForEnergy(input: string): string {
  return input.replace(/[^0-9.Jk ]/g, "");
}

export function sanitizeForPower(input: string): string {
  return input.replace(/[^0-9.Wk ]/g, "");
}

export function sanitizeForFrequencyHz(input: string): string {
  return input.replace(/[^0-9.HzkMGT ]/g, "");
}

export function sanitizeForDataSize(input: string): string {
  return input.replace(/[^0-9.BKMGTPE ]/g, "");
}

export function sanitizeForDataRate(input: string): string {
  return input.replace(/[^0-9.bpsKMGT ]/g, "");
}

export function sanitizeForPercentage(input: string): string {
  return input.replace(/[^0-9.%]/g, "");
}

export function sanitizeForRatio(input: string): string {
  return input.replace(/[^0-9.:\/]/g, "");
}

export function sanitizeForProportion(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForFraction(input: string): string {
  return input.replace(/[^0-9./]/g, "");
}

export function sanitizeForDecimal(input: string): string {
  return input.replace(/[^0-9.\-]/g, "");
}

export function sanitizeForScientific(input: string): string {
  return input.replace(/[^0-9.eE\-+]/g, "");
}

export function sanitizeForCoordinates(input: string): string {
  return input.replace(/[^0-9.\-, ]/g, "");
}

export function sanitizeForLatitude(input: string): string {
  return input.replace(/[^0-9.\-NnSs ]/g, "");
}

export function sanitizeForLongitude(input: string): string {
  return input.replace(/[^0-9.\-EeWw ]/g, "");
}

export function sanitizeForAltitude(input: string): string {
  return input.replace(/[^0-9.\-m ]/g, "");
}

export function sanitizeForHeading(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForBearing(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForDirection(input: string): string {
  return input.replace(/[^NSEWnsew0-9.?]/g, "");
}

export function sanitizeForCompass(input: string): string {
  return input.replace(/[^NSEWnsew0-9.?]/g, "");
}

export function sanitizeForAzimuth(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForElevation(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForDeclination(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForInclination(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForDip(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForPitch(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForRoll(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForYaw(input: string): string {
  return input.replace(/[^0-9.?\-]/g, "");
}

export function sanitizeForGForce(input: string): string {
  return input.replace(/[^0-9.G\-]/g, "");
}

export function sanitizeForRPM(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForTorque(input: string): string {
  return input.replace(/[^0-9.Nm ]/g, "");
}

export function sanitizeForForce(input: string): string {
  return input.replace(/[^0-9.Nk ]/g, "");
}

export function sanitizeForMomentum(input: string): string {
  return input.replace(/[^0-9.kgms ]/g, "");
}

export function sanitizeForImpulse(input: string): string {
  return input.replace(/[^0-9.Ns ]/g, "");
}

export function sanitizeForWork(input: string): string {
  return input.replace(/[^0-9.Jk ]/g, "");
}

export function sanitizeForHeat(input: string): string {
  return input.replace(/[^0-9.Jk ]/g, "");
}

export function sanitizeForEntropy(input: string): string {
  return input.replace(/[^0-9.JkK ]/g, "");
}

export function sanitizeForSpecificHeat(input: string): string {
  return input.replace(/[^0-9.JkgK ]/g, "");
}

export function sanitizeForThermalConductivity(input: string): string {
  return input.replace(/[^0-9.WmK ]/g, "");
}

export function sanitizeForThermalExpansion(input: string): string {
  return input.replace(/[^0-9.\-/K]/g, "");
}

export function sanitizeForViscosity(input: string): string {
  return input.replace(/[^0-9.Pas ]/g, "");
}

export function sanitizeForDensity(input: string): string {
  return input.replace(/[^0-9.kgm? ]/g, "");
}

export function sanitizeForSpecificGravity(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForSpecificVolume(input: string): string {
  return input.replace(/[^0-9.m?kg ]/g, "");
}

export function sanitizeForMolarMass(input: string): string {
  return input.replace(/[^0-9.gmol ]/g, "");
}

export function sanitizeForMolarVolume(input: string): string {
  return input.replace(/[^0-9.Lmol ]/g, "");
}

export function sanitizeForMolarConcentration(input: string): string {
  return input.replace(/[^0-9.molL ]/g, "");
}

export function sanitizeForMolality(input: string): string {
  return input.replace(/[^0-9.molkg ]/g, "");
}

export function sanitizeForMoleFraction(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForMassFraction(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForVolumeFraction(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForConcentration(input: string): string {
  return input.replace(/[^0-9.molL% ]/g, "");
}

export function sanitizeForPH(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForConductivity(input: string): string {
  return input.replace(/[^0-9.Sm ]/g, "");
}

export function sanitizeForResistivity(input: string): string {
  return input.replace(/[^0-9.?m ]/g, "");
}

export function sanitizeForMagneticField(input: string): string {
  return input.replace(/[^0-9.Tm ]/g, "");
}

export function sanitizeForMagneticFlux(input: string): string {
  return input.replace(/[^0-9.Wb ]/g, "");
}

export function sanitizeForMagneticFluxDensity(input: string): string {
  return input.replace(/[^0-9.T ]/g, "");
}

export function sanitizeForElectricField(input: string): string {
  return input.replace(/[^0-9.Vm ]/g, "");
}

export function sanitizeForElectricFlux(input: string): string {
  return input.replace(/[^0-9.Vm ]/g, "");
}

export function sanitizeForElectricCharge(input: string): string {
  return input.replace(/[^0-9.C ]/g, "");
}

export function sanitizeForElectricPotential(input: string): string {
  return input.replace(/[^0-9.Vk ]/g, "");
}

export function sanitizeForCapacitanceValue(input: string): string {
  return input.replace(/[^0-9.Fpn ]/g, "");
}

export function sanitizeForInductance(input: string): string {
  return input.replace(/[^0-9.Hm ]/g, "");
}

export function sanitizeForReactance(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForImpedance(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForAdmittance(input: string): string {
  return input.replace(/[^0-9.S ]/g, "");
}

export function sanitizeForConductance(input: string): string {
  return input.replace(/[^0-9.S ]/g, "");
}

export function sanitizeForSusceptance(input: string): string {
  return input.replace(/[^0-9.S ]/g, "");
}

export function sanitizeForPermeability(input: string): string {
  return input.replace(/[^0-9.Hm ]/g, "");
}

export function sanitizeForPermittivity(input: string): string {
  return input.replace(/[^0-9.Fm ]/g, "");
}

export function sanitizeForReluctance(input: string): string {
  return input.replace(/[^0-9.AT/Wb ]/g, "");
}

export function sanitizeForPermeance(input: string): string {
  return input.replace(/[^0-9.WbAT ]/g, "");
}

export function sanitizeForMagneticMoment(input: string): string {
  return input.replace(/[^0-9.Am? ]/g, "");
}

export function sanitizeForMagneticDipoleMoment(input: string): string {
  return input.replace(/[^0-9.JT ]/g, "");
}

export function sanitizeForBohrMagneton(input: string): string {
  return input.replace(/[^0-9.JT ]/g, "");
}

export function sanitizeForNuclearMagnetron(input: string): string {
  return input.replace(/[^0-9.JT ]/g, "");
}

export function sanitizeForLuminousIntensity(input: string): string {
  return input.replace(/[^0-9.cd ]/g, "");
}

export function sanitizeForLuminousFlux(input: string): string {
  return input.replace(/[^0-9.lm ]/g, "");
}

export function sanitizeForIlluminance(input: string): string {
  return input.replace(/[^0-9.lx ]/g, "");
}

export function sanitizeForLuminance(input: string): string {
  return input.replace(/[^0-9.cdm? ]/g, "");
}

export function sanitizeForLuminousEfficacy(input: string): string {
  return input.replace(/[^0-9.lmW ]/g, "");
}

export function sanitizeForLuminousEnergy(input: string): string {
  return input.replace(/[^0-9.lms ]/g, "");
}

export function sanitizeForLuminousExposure(input: string): string {
  return input.replace(/[^0-9.lxs ]/g, "");
}

export function sanitizeForLuminousDensity(input: string): string {
  return input.replace(/[^0-9.lmm? ]/g, "");
}

export function sanitizeForLuminousEmittance(input: string): string {
  return input.replace(/[^0-9.lx ]/g, "");
}

export function sanitizeForLuminousExitance(input: string): string {
  return input.replace(/[^0-9.lmm? ]/g, "");
}

export function sanitizeForRadiantIntensity(input: string): string {
  return input.replace(/[^0-9.Wsr ]/g, "");
}

export function sanitizeForRadiance(input: string): string {
  return input.replace(/[^0-9.Wm?sr ]/g, "");
}

export function sanitizeForIrradiance(input: string): string {
  return input.replace(/[^0-9.Wm? ]/g, "");
}

export function sanitizeForRadiantFlux(input: string): string {
  return input.replace(/[^0-9.W ]/g, "");
}

export function sanitizeForRadiantEnergy(input: string): string {
  return input.replace(/[^0-9.J ]/g, "");
}

export function sanitizeForRadiantExposure(input: string): string {
  return input.replace(/[^0-9.Jm? ]/g, "");
}

export function sanitizeForRadiantEmittance(input: string): string {
  return input.replace(/[^0-9.Wm? ]/g, "");
}

export function sanitizeForSpectralIntensity(input: string): string {
  return input.replace(/[^0-9.WsrHz ]/g, "");
}

export function sanitizeForSpectralRadiance(input: string): string {
  return input.replace(/[^0-9.Wm?srHz ]/g, "");
}

export function sanitizeForSpectralIrradiance(input: string): string {
  return input.replace(/[^0-9.Wm?Hz ]/g, "");
}

export function sanitizeForSpectralPower(input: string): string {
  return input.replace(/[^0-9.WHz ]/g, "");
}

export function sanitizeForSpectralEnergy(input: string): string {
  return input.replace(/[^0-9.JHz ]/g, "");
}

export function sanitizeForSpectralExitance(input: string): string {
  return input.replace(/[^0-9.Wm?Hz ]/g, "");
}

export function sanitizeForAbsorptance(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForReflectance(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForTransmittance(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForEmissivity(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForAlbedo(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForOpacity(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForOpticalDepth(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForAbsorptionCoefficient(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForScatteringCoefficient(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForAttenuationCoefficient(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForExtinctionCoefficient(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForRefractiveIndex(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForDispersion(input: string): string {
  return input.replace(/[^0-9.nm?? ]/g, "");
}

export function sanitizeForAbbeNumber(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForNumericalAperture(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForFocalLength(input: string): string {
  return input.replace(/[^0-9.mm ]/g, "");
}

export function sanitizeForAperture(input: string): string {
  return input.replace(/[^0-9.f/]/g, "");
}

export function sanitizeForFNumber(input: string): string {
  return input.replace(/[^0-9.f/]/g, "");
}

export function sanitizeForSolidAngle(input: string): string {
  return input.replace(/[^0-9.sr ]/g, "");
}

export function sanitizeForAngularVelocity(input: string): string {
  return input.replace(/[^0-9.rads ]/g, "");
}

export function sanitizeForAngularAcceleration(input: string): string {
  return input.replace(/[^0-9.rads? ]/g, "");
}

export function sanitizeForAngularMomentum(input: string): string {
  return input.replace(/[^0-9.kgm?s ]/g, "");
}

export function sanitizeForAngularFrequency(input: string): string {
  return input.replace(/[^0-9.rads ]/g, "");
}

export function sanitizeForWavenumber(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForFrequencyAngular(input: string): string {
  return input.replace(/[^0-9.rads ]/g, "");
}

export function sanitizeForPeriod(input: string): string {
  return input.replace(/[^0-9.s ]/g, "");
}

export function sanitizeForWavelength(input: string): string {
  return input.replace(/[^0-9.nm ]/g, "");
}

export function sanitizeForAmplitude(input: string): string {
  return input.replace(/[^0-9.m ]/g, "");
}

export function sanitizeForPhase(input: string): string {
  return input.replace(/[^0-9.?rad ]/g, "");
}

export function sanitizeForPhaseShift(input: string): string {
  return input.replace(/[^0-9.?rad ]/g, "");
}

export function sanitizeForPhaseVelocity(input: string): string {
  return input.replace(/[^0-9.ms ]/g, "");
}

export function sanitizeForGroupVelocity(input: string): string {
  return input.replace(/[^0-9.ms ]/g, "");
}

export function sanitizeForWaveImpedance(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForWaveNumber(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForWaveVector(input: string): string {
  return input.replace(/[^0-9.m?? ]/g, "");
}

export function sanitizeForDecibel(input: string): string {
  return input.replace(/[^0-9.dB\-]/g, "");
}

export function sanitizeForBel(input: string): string {
  return input.replace(/[^0-9.B\-]/g, "");
}

export function sanitizeForNeper(input: string): string {
  return input.replace(/[^0-9.Np\-]/g, "");
}

export function sanitizeForOctave(input: string): string {
  return input.replace(/[^0-9.oct ]/g, "");
}

export function sanitizeForDecade(input: string): string {
  return input.replace(/[^0-9.dec ]/g, "");
}

export function sanitizeForStopBand(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForPassBand(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForCutoffFrequency(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForResonantFrequency(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForNaturalFrequency(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForDampedFrequency(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForDampingRatio(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForDampingCoefficient(input: string): string {
  return input.replace(/[^0-9.Nsm ]/g, "");
}

export function sanitizeForQualityFactor(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForBandwidth(input: string): string {
  return input.replace(/[^0-9.Hz ]/g, "");
}

export function sanitizeForInsertionLoss(input: string): string {
  return input.replace(/[^0-9.dB\-]/g, "");
}

export function sanitizeForReturnLoss(input: string): string {
  return input.replace(/[^0-9.dB\-]/g, "");
}

export function sanitizeForVSWR(input: string): string {
  return input.replace(/[^0-9.:]/g, "");
}

export function sanitizeForReflectionCoefficient(input: string): string {
  return input.replace(/[^0-9.\-]/g, "");
}

export function sanitizeForTransmissionCoefficient(input: string): string {
  return input.replace(/[^0-9.\-]/g, "");
}

export function sanitizeForStandingWaveRatio(input: string): string {
  return input.replace(/[^0-9.:]/g, "");
}

export function sanitizeForImpedanceMatching(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForReflection(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForRefraction(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForDiffraction(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForInterference(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForPolarization(input: string): string {
  return input.replace(/[^0-9.?]/g, "");
}

export function sanitizeForCoherence(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForCorrelation(input: string): string {
  return input.replace(/[^0-9.\-]/g, "");
}

export function sanitizeForConvolution(input: string): string {
  return input.replace(/[^0-9.\-]/g, "");
}

export function sanitizeForFourierTransform(input: string): string {
  return input.replace(/[^0-9.\-j]/g, "");
}

export function sanitizeForLaplaceTransform(input: string): string {
  return input.replace(/[^0-9.\-js]/g, "");
}

export function sanitizeForZTransform(input: string): string {
  return input.replace(/[^0-9.\-jz]/g, "");
}

export function sanitizeForTransferFunction(input: string): string {
  return input.replace(/[^0-9.\-js]/g, "");
}

export function sanitizeForFrequencyResponse(input: string): string {
  return input.replace(/[^0-9.HzdB\-]/g, "");
}

export function sanitizeForImpulseResponse(input: string): string {
  return input.replace(/[^0-9.s\-]/g, "");
}

export function sanitizeForStepResponse(input: string): string {
  return input.replace(/[^0-9.s\-]/g, "");
}

export function sanitizeForRampResponse(input: string): string {
  return input.replace(/[^0-9.s\-]/g, "");
}

export function sanitizeForParabolicResponse(input: string): string {
  return input.replace(/[^0-9.s\-]/g, "");
}

export function sanitizeForStability(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForControllability(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForObservability(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForReachability(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForDetectability(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForStabilizability(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}

export function sanitizeForDetectability2(input: string): string {
  return input.replace(/[^0-9.]/g, "");
}
