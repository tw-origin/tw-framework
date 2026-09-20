/**
 * Path Traversal Prevention -- prevents directory traversal attacks
 * (../, ..\, %2e%2e, etc.) and validates file paths.
 *
 * @module security/path-traversal/preventer
 */

/** Path traversal detection result. */
export interface PathTraversalResult {
  safe: boolean;
  detected: boolean;
  patterns: string[];
  sanitizedPath: string;
  normalizedPath: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** Path traversal patterns. */
const TRAVERSAL_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // Basic traversal
  { pattern: /\.\.\//, name: "../ traversal", severity: 9 },
  { pattern: /\.\.\\/, name: "..\\ traversal", severity: 9 },
  { pattern: /\.\.%2f/i, name: "..%2f traversal", severity: 9 },
  { pattern: /\.\.%5c/i, name: "..%5c traversal", severity: 9 },
  { pattern: /%2e%2e/i, name: "URL encoded .. ", severity: 8 },
  { pattern: /%2e%2e%2f/i, name: "URL encoded ../", severity: 9 },
  { pattern: /%2e%2e%5c/i, name: "URL encoded ..\\", severity: 9 },
  { pattern: /%2e%2e\/|\/%2e%2e/i, name: "Partial encoded ../", severity: 8 },

  // Double encoding
  { pattern: /%252e%252e/i, name: "Double encoded ..", severity: 10 },
  { pattern: /%252f/i, name: "Double encoded /", severity: 9 },
  { pattern: /%255c/i, name: "Double encoded \\", severity: 9 },

  // Unicode encoding
  { pattern: /\\u002e\\u002e/i, name: "Unicode encoded ..", severity: 9 },
  { pattern: /\\x2e\\x2e/i, name: "Hex encoded ..", severity: 9 },

  // Null byte injection
  { pattern: /\x00/, name: "Null byte", severity: 10 },
  { pattern: /%00/, name: "URL encoded null", severity: 10 },

  // Absolute path attempts
  { pattern: /^(\/|\\)/, name: "Absolute path", severity: 7 },
  { pattern: /^[a-zA-Z]:[\\/]/, name: "Windows absolute path", severity: 7 },

  // UNC paths
  { pattern: /^\\\\[^\\]/, name: "UNC path", severity: 8 },

  // File URL
  { pattern: /^file:\/\//i, name: "file:// protocol", severity: 9 },

  // Filter bypass attempts
  { pattern: /\.\.\.\./, name: ".... bypass", severity: 7 },
  { pattern: /\.\/\.\.\//, name: "Nested ./../", severity: 8 },
  { pattern: /\.\.\/\.\.\//, name: "Nested ../../", severity: 8 },

  // Symbolic link
  { pattern: /\.\.\/~\//, name: "Home dir traversal", severity: 6 },
];

/** Dangerous file extensions. */
const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".php", ".jsp", ".asp", ".aspx",
  ".py", ".rb", ".pl", ".cgi", ".so", ".dll", ".dylib", ".dylib",
  ".jar", ".war", ".class", ".bin", ".msi", ".dmg", ".deb", ".rpm",
  ".appimage", ".snap", ".flatpak", ".app",
]);

/** Sensitive system files. */
const SENSITIVE_PATHS = [
  "/etc/passwd", "/etc/shadow", "/etc/sudoers", "/etc/hosts",
  "/etc/ssh/", "/etc/crontab", "/root/", "/home/",
  "/proc/self/", "/proc/version", "/sys/",
  "C:\\Windows\\System32\\", "C:\\Windows\\repair",
  "C:\\Users\\", "%USERPROFILE%", "%APPDATA%",
  "C:\\boot.ini", "C:\\autoexec.bat",
  "/var/log/", "/var/spool/", "/var/mail/",
  "/.ssh/", "/.env", "/.git/", "/.bash_history",
  "/wp-config.php", "/config.php", "/.htaccess",
  "/database.yml", "/secrets.yml", "/id_rsa",
];

/** Normalizes a path, resolving .. and . segments. */
function normalizePath(path: string): string {
  // Replace backslashes with forward slashes
  let normalized = path.replace(/\\/g, "/");

  // URL decode (handles %2e, %2f, etc.)
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Already decoded or invalid encoding
  }

  // Resolve . and .. segments
  const parts = normalized.split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      if (resolved.length > 0) {
        resolved.pop();
      }
    } else if (part === "." || part === "") {
      continue;
    } else {
      resolved.push(part);
    }
  }

  return resolved.join("/");
}

/** Checks if a path contains dangerous patterns. */
function checkPath(path: string): { patterns: string[]; maxSeverity: number } {
  const detectedPatterns: string[] = [];
  let maxSeverity = 0;

  for (const { pattern, name, severity } of TRAVERSAL_PATTERNS) {
    if (pattern.test(path)) {
      if (!detectedPatterns.includes(name)) {
        detectedPatterns.push(name);
      }
      maxSeverity = Math.max(maxSeverity, severity);
    }
  }

  // Check for dangerous extensions
  const lowerPath = path.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) {
      detectedPatterns.push(`Dangerous extension: ${ext}`);
      maxSeverity = Math.max(maxSeverity, 7);
      break;
    }
  }

  // Check for sensitive paths
  for (const sensitive of SENSITIVE_PATHS) {
    if (lowerPath.includes(sensitive.toLowerCase())) {
      detectedPatterns.push(`Sensitive path: ${sensitive}`);
      maxSeverity = Math.max(maxSeverity, 9);
      break;
    }
  }

  return { patterns: detectedPatterns, maxSeverity };
}

/** Calculates risk. */
function riskFromSeverity(severity: number): PathTraversalResult["risk"] {
  if (severity >= 10) return "critical";
  if (severity >= 8) return "high";
  if (severity >= 6) return "medium";
  if (severity >= 4) return "low";
  return "none";
}

/**
 * Path Traversal Preventer -- detects and prevents directory
 * traversal attacks.
 */
export class PathTraversalPreventer {
  private baseDir: string;
  private allowedExtensions: Set<string> | null;
  private blockedExtensions: Set<string>;
  private strict: boolean;

  constructor(options: {
    baseDir?: string;
    allowedExtensions?: string[];
    blockedExtensions?: string[];
    strict?: boolean;
  } = {}) {
    this.baseDir = options.baseDir ?? "";
    this.allowedExtensions = options.allowedExtensions
      ? new Set(options.allowedExtensions.map(e => e.toLowerCase()))
      : null;
    this.blockedExtensions = new Set(
      [...DANGEROUS_EXTENSIONS, ...(options.blockedExtensions ?? [])].map(e => e.toLowerCase())
    );
    this.strict = options.strict ?? false;
  }

  /** Validates a file path. */
  validate(path: string): PathTraversalResult {
    const checked = checkPath(path);
    const { patterns } = checked;
    let maxSeverity = checked.maxSeverity;
    const normalized = normalizePath(path);

    // Check if normalized path escapes base directory.
    // Build fullPath from the NORMALIZED base so a baseDir with trailing
    // slashes, mixed separators or `..` segments cannot make fullPath and
    // baseNormalized disagree about what "inside" looks like.
    const baseNormalized = this.baseDir ? normalizePath(this.baseDir) : "";
    const fullPath = baseNormalized ? `${baseNormalized}/${normalized}` : normalized;

    let escapesBase = false;
    if (baseNormalized) {
      // Boundary-aware containment: a plain startsWith() would also accept
      // sibling directories that merely share a prefix ("app/public" vs
      // "app/public-secret").
      const inside = fullPath === baseNormalized || fullPath.startsWith(baseNormalized + "/");
      if (!inside) {
        escapesBase = true;
        if (!patterns.includes("Path escapes base directory")) {
          patterns.push("Path escapes base directory");
        }
        maxSeverity > 9 || (maxSeverity = 9);
      }
    }

    // Check extension
    const ext = this.getExtension(normalized);
    if (this.allowedExtensions && ext && !this.allowedExtensions.has(ext.toLowerCase())) {
      patterns.push(`Extension not allowed: ${ext}`);
      maxSeverity > 6 || (maxSeverity = 6);
    }
    if (this.blockedExtensions.has(ext.toLowerCase())) {
      patterns.push(`Blocked extension: ${ext}`);
      maxSeverity > 8 || (maxSeverity = 8);
    }

    const detected = patterns.length > 0;
    const safe = !detected || (!escapesBase && maxSeverity < 6);

    return {
      safe,
      detected,
      patterns,
      sanitizedPath: safe ? normalized : "",
      normalizedPath: normalized,
      risk: riskFromSeverity(maxSeverity),
    };
  }

  /** Gets the file extension from a path. */
  private getExtension(path: string): string {
    const lastDot = path.lastIndexOf(".");
    const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (lastDot > lastSlash) {
      return path.slice(lastDot).toLowerCase();
    }
    return "";
  }

  /** Checks if a path is safe. */
  isSafe(path: string): boolean {
    return this.validate(path).safe;
  }

  /** Sanitizes a path by removing traversal sequences. */
  sanitize(path: string): string {
    const result = this.validate(path);
    if (result.safe) {
      return result.normalizedPath;
    }
    return "";
  }

  /** Validates a batch of paths. */
  validateBatch(paths: string[]): Array<{ path: string; result: PathTraversalResult }> {
    return paths.map(path => ({ path, result: this.validate(path) }));
  }
}

/** Creates a new path traversal preventer. */
export function createPathPreventer(options?: {
  baseDir?: string;
  allowedExtensions?: string[];
  blockedExtensions?: string[];
  strict?: boolean;
}): PathTraversalPreventer {
  return new PathTraversalPreventer(options);
}
