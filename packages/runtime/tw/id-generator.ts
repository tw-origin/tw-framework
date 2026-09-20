/**
 * ID Generator -- unique ID generation utilities.
 *
 * Features:
 * - UUID v4 (RFC 4122 compliant)
 * - ULID (Universally Unique Lexicographically Sortable ID)
 * - NanoID (compact URL-safe IDs)
 * - Sequential IDs (with optional prefix)
 * - Snowflake IDs (Twitter-style distributed IDs)
 * - Hash IDs (short, non-sequential, reversible)
 * - Custom alphabet IDs
 * - Collision detection
 * - Monotonic IDs
 */

// --- UUID v4 ----------------------------------------------------------

/**
 * Generate a RFC 4122 v4 UUID.
 * Uses crypto.randomUUID when available, falls back to manual generation.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

// --- NanoID ----------------------------------------------------------

const NANO_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
const NANO_DEFAULT_SIZE = 21;

/**
 * Generate a NanoID (compact URL-safe unique ID).
 */
export function nanoId(size: number = NANO_DEFAULT_SIZE, alphabet: string = NANO_ALPHABET): string {
  const mask = (2 << Math.log(alphabet.length - 1) / Math.LN2) - 1;
  const step = Math.ceil((mask * size) / 32);
  let id = "";

  while (id.length < size) {
    const bytes = new Uint8Array(step);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < step; i++) bytes[i] = Math.floor(Math.random() * 256);
    }

    for (let i = 0; i < step && id.length < size; i++) {
      const idx = bytes[i] & mask;
      if (idx < alphabet.length) {
        id += alphabet[idx];
      }
    }
  }

  return id;
}

// --- ULID ------------------------------------------------------------

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
const ULID_TIME_LEN = 10;
const ULID_RANDOM_LEN = 16;

/**
 * Generate a ULID (Universally Unique Lexicographically Sortable ID).
 */
export function ulid(timestamp: number = Date.now()): string {
  const timeChars = encodeTime(timestamp, ULID_TIME_LEN);
  const randomChars = encodeRandom(ULID_RANDOM_LEN);
  return timeChars + randomChars;
}

function encodeTime(timestamp: number, length: number): string {
  let str = "";
  let time = timestamp;

  for (let i = length - 1; i >= 0; i--) {
    const mod = time % ULID_ALPHABET.length;
    str = ULID_ALPHABET[mod] + str;
    time = Math.floor(time / ULID_ALPHABET.length);
  }

  return str;
}

function encodeRandom(length: number): string {
  let str = "";
  const bytes = new Uint8Array(length);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  for (let i = 0; i < length; i++) {
    str += ULID_ALPHABET[bytes[i] % ULID_ALPHABET.length];
  }

  return str;
}

// --- Sequential IDs ---------------------------------------------------

let sequentialCounter = 0;

/**
 * Generate a sequential ID.
 */
export function sequentialId(prefix: string = "", separator: string = "-"): string {
  sequentialCounter++;
  return prefix ? `${prefix}${separator}${sequentialCounter}` : String(sequentialCounter);
}

/**
 * Reset the sequential counter.
 */
export function resetSequentialCounter(): void {
  sequentialCounter = 0;
}

// --- Snowflake IDs --------------------------------------------------

const EPOCH = 1609459200000; // 2021-01-01T00:00:00.000Z
const WORKER_ID_BITS = 10;
const SEQUENCE_BITS = 12;
const MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1;

let snowflakeWorkerId = 1;
let snowflakeSequence = 0;
let snowflakeLastTimestamp = -1;

/**
 * Generate a Snowflake ID (Twitter-style distributed unique ID).
 */
export function snowflake(workerId: number = snowflakeWorkerId): string {
  let timestamp = Date.now() - EPOCH;

  if (timestamp === snowflakeLastTimestamp) {
    snowflakeSequence = (snowflakeSequence + 1) & MAX_SEQUENCE;
    if (snowflakeSequence === 0) {
      // Sequence overflow -- wait for next millisecond
      while (timestamp <= snowflakeLastTimestamp) {
        timestamp = Date.now() - EPOCH;
      }
    }
  } else {
    snowflakeSequence = 0;
  }

  snowflakeLastTimestamp = timestamp;

  let id = (BigInt(timestamp) << BigInt(WORKER_ID_BITS + SEQUENCE_BITS))
    | (BigInt(workerId) << BigInt(SEQUENCE_BITS))
    | BigInt(snowflakeSequence);

  return id.toString();
}

/**
 * Set the worker ID for snowflake generation.
 */
export function setSnowflakeWorkerId(id: number): void {
  if (id < 0 || id >= (1 << WORKER_ID_BITS)) {
    throw new Error(`[TW ID] Worker ID must be between 0 and ${(1 << WORKER_ID_BITS) - 1}`);
  }
  snowflakeWorkerId = id;
}

// --- Custom Alphabet --------------------------------------------------

/**
 * Create a custom ID generator with a specific alphabet.
 */
export function createIdGenerator(alphabet: string, defaultSize: number = 16) {
  return (size: number = defaultSize): string => {
    let id = "";
    const bytes = new Uint8Array(size);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < size; i++) {
      id += alphabet[bytes[i] % alphabet.length];
    }
    return id;
  };
}

// --- Hash ID (Short, non-sequential, reversible) --------------------

const HASH_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Encode a number as a short hash ID.
 */
export function encodeHashId(num: number): string {
  if (num === 0) return HASH_ALPHABET[0];
  let str = "";
  let n = Math.abs(num);
  while (n > 0) {
    str = HASH_ALPHABET[n % HASH_ALPHABET.length] + str;
    n = Math.floor(n / HASH_ALPHABET.length);
  }
  return num < 0 ? `-${str}` : str;
}

/**
 * Decode a hash ID back to a number.
 */
export function decodeHashId(str: string): number {
  let num = 0;
  const negative = str.startsWith("-");
  const positive = negative ? str.substring(1) : str;

  for (let i = 0; i < positive.length; i++) {
    const idx = HASH_ALPHABET.indexOf(positive[i]);
    if (idx < 0) return NaN;
    num = num * HASH_ALPHABET.length + idx;
  }

  return negative ? -num : num;
}

// --- Collision Detection ----------------------------------------------

const usedIds = new Set<string>();

/**
 * Generate a unique ID, ensuring no collision.
 */
export function uniqueId(generator: () => string = uuid): string {
  let id: string;
  let attempts = 0;
  do {
    id = generator();
    attempts++;
    if (attempts > 100) {
      throw new Error("[TW ID] Failed to generate a unique ID after 100 attempts");
    }
  } while (usedIds.has(id));

  usedIds.add(id);
  return id;
}

/**
 * Register an ID as used (for collision prevention).
 */
export function registerId(id: string): void {
  usedIds.add(id);
}

/**
 * Release an ID (allow it to be used again).
 */
export function releaseId(id: string): void {
  usedIds.delete(id);
}

/**
 * Check if an ID is already used.
 */
export function isIdUsed(id: string): boolean {
  return usedIds.has(id);
}

/**
 * Clear all registered IDs.
 */
export function clearRegisteredIds(): void {
  usedIds.clear();
}
