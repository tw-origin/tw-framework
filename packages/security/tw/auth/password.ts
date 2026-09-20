/**
 * Password Manager -- secure password hashing, verification, and
 * strength validation using PBKDF2 via Web Crypto API.
 *
 * @module security/auth/password
 */

/** Password hash result. */
export interface PasswordHashResult {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: string;
}

/** Password strength result. */
export interface PasswordStrengthResult {
  score: number;       // 0-4
  label: "very-weak" | "weak" | "fair" | "strong" | "very-strong";
  entropy: number;      // bits
  suggestions: string[];
  passed: boolean;
}

/** Password configuration. */
export interface PasswordConfig {
  minEntropy?: number;
  minLength?: number;
  maxLength?: number;
  iterations?: number;
  saltLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSymbols?: boolean;
}

const DEFAULTS: Required<PasswordConfig> = {
  minEntropy: 50,
  minLength: 8,
  maxLength: 128,
  iterations: 100000,
  saltLength: 32,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSymbols: false,
};

/** Generates a random salt. */
function generateSalt(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Derives a key using PBKDF2. */
async function deriveKey(password: string, salt: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256 // 32 bytes
  );

  return btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
}

/** Calculates password entropy in bits. */
function calculateEntropy(password: string): number {
  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;
  return Math.round(password.length * Math.log2(poolSize || 1));
}

/**
 * Password Manager -- handles password hashing, verification,
 * and strength checking.
 */
export class PasswordManager {
  private config: Required<PasswordConfig>;

  constructor(config: PasswordConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  /** Hashes a password using PBKDF2. */
  async hash(password: string): Promise<PasswordHashResult> {
    const salt = generateSalt(this.config.saltLength);
    const hash = await deriveKey(password, salt, this.config.iterations);
    return {
      hash,
      salt,
      iterations: this.config.iterations,
      algorithm: "PBKDF2-SHA256",
    };
  }

  /** Verifies a password against a stored hash. */
  async verify(password: string, stored: PasswordHashResult): Promise<boolean> {
    // Malformed/foreign `stored` values must fail closed, not throw.
    if (!stored || typeof stored !== "object" || !stored.salt || !stored.hash || !stored.iterations) {
      return false;
    }
    let hash: string;
    try {
      hash = await deriveKey(password, stored.salt, stored.iterations);
    } catch {
      return false;
    }

    // Constant-time comparison
    if (hash.length !== stored.hash.length) return false;
    let result = 0;
    for (let i = 0; i < hash.length; i++) {
      result |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i);
    }
    return result === 0;
  }

  /** Checks if a hash needs to be re-hashed (higher iterations). */
  needsRehash(stored: PasswordHashResult): boolean {
    return stored.iterations < this.config.iterations;
  }

  /** Checks password strength. */
  checkStrength(password: string): PasswordStrengthResult {
    const suggestions: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= this.config.minLength) score++;
    if (password.length >= 16) score++;
    if (password.length < this.config.minLength) {
      suggestions.push(`Use at least ${this.config.minLength} characters`);
    }

    // Character variety
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
    if (varietyCount >= 3) score++;
    if (varietyCount === 4) score++;

    if (!hasUpper) suggestions.push("Add uppercase letters");
    if (!hasNumber) suggestions.push("Add numbers");
    if (!hasSymbol) suggestions.push("Add special characters");

    // Entropy
    const entropy = calculateEntropy(password);
    if (entropy >= this.config.minEntropy) score++;
    if (entropy < this.config.minEntropy) {
      suggestions.push(`Password entropy is ${entropy} bits (minimum: ${this.config.minEntropy})`);
    }

    // Common password check
    const common = ["password", "12345678", "qwerty", "abc123", "letmein", "admin"];
    if (common.some(c => password.toLowerCase().includes(c))) {
      score = Math.max(0, score - 2);
      suggestions.push("Avoid common password patterns");
    }

    // Sequential characters
    if (/(.)\1{2,}/.test(password)) {
      score = Math.max(0, score - 1);
      suggestions.push("Avoid repeated characters");
    }

    score = Math.min(4, Math.max(0, score));
    const labels: PasswordStrengthResult["label"][] = ["very-weak", "weak", "fair", "strong", "very-strong"];

    return {
      score,
      label: labels[score],
      entropy,
      suggestions,
      passed: score >= 3 && entropy >= this.config.minEntropy,
    };
  }

  /** Generates a random password. */
  generate(length: number = 16): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => charset[b % charset.length]).join("");
  }
}

/** Creates a new password manager. */
export function createPasswordManager(config?: PasswordConfig): PasswordManager {
  return new PasswordManager(config);
}
