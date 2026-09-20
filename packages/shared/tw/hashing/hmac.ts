/** HMAC signing and verification using Web Crypto API. */

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}


export async function hmac(
  key: string,
  message: string,
  algorithm: "SHA-256" | "SHA-384" | "SHA-512" = "SHA-256",
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return bufferToHex(signature);
}

export async function verifyHmac(
  key: string,
  message: string,
  signature: string,
  algorithm: "SHA-256" | "SHA-384" | "SHA-512" = "SHA-256",
): Promise<boolean> {
  const computed = await hmac(key, message, algorithm);
  return timingSafeEqual(computed, signature);
}

