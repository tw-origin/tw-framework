/**
 * Content Security -- MIME type sniffing prevention, content
 * disposition validation, and file upload security.
 *
 * @module security/content-security/protector
 */

/** File upload validation result. */
export interface UploadValidationResult {
  allowed: boolean;
  reason: string;
  sanitizedFilename: string;
  detectedType: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** Content type validation result. */
export interface ContentTypeResult {
  safe: boolean;
  contentType: string;
  reason: string;
}

/** Allowed file types with their MIME types and signatures. */
const FILE_SIGNATURES: Array<{ ext: string[]; mime: string; signature: number[]; maxSignatureOffset?: number }> = [
  { ext: ["jpg", "jpeg"], mime: "image/jpeg", signature: [0xFF, 0xD8, 0xFF] },
  { ext: ["png"], mime: "image/png", signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: ["gif"], mime: "image/gif", signature: [0x47, 0x49, 0x46, 0x38] },
  { ext: ["webp"], mime: "image/webp", signature: [0x52, 0x49, 0x46, 0x46] },
  { ext: ["svg"], mime: "image/svg+xml", signature: [0x3C, 0x3F, 0x78, 0x6D, 0x6C] },
  { ext: ["pdf"], mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46] },
  { ext: ["zip"], mime: "application/zip", signature: [0x50, 0x4B, 0x03, 0x04] },
  { ext: ["gz", "gzip"], mime: "application/gzip", signature: [0x1F, 0x8B] },
  { ext: ["mp3"], mime: "audio/mpeg", signature: [0x49, 0x44, 0x33] },
  { ext: ["mp4"], mime: "video/mp4", signature: [0x66, 0x74, 0x79, 0x70], maxSignatureOffset: 4 },
  { ext: ["webm"], mime: "video/webm", signature: [0x1A, 0x45, 0xDF, 0xA3] },
  { ext: ["woff"], mime: "font/woff", signature: [0x77, 0x4F, 0x46, 0x46] },
  { ext: ["woff2"], mime: "font/woff2", signature: [0x77, 0x4F, 0x46, 0x32] },
  { ext: ["ttf"], mime: "font/ttf", signature: [0x00, 0x01, 0x00, 0x00] },
  { ext: ["otf"], mime: "font/otf", signature: [0x4F, 0x54, 0x54, 0x4F] },
  { ext: ["ico"], mime: "image/x-icon", signature: [0x00, 0x00, 0x01, 0x00] },
  { ext: ["bmp"], mime: "image/bmp", signature: [0x42, 0x4D] },
];

/** Dangerous file extensions. */
const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".dll",
  ".sh", ".bash", ".zsh", ".fish",
  ".php", ".php3", ".php4", ".php5", ".phtml",
  ".jsp", ".jspx", ".asp", ".aspx", ".ashx",
  ".py", ".rb", ".pl", ".cgi",
  ".jar", ".class", ".war",
  ".htaccess", ".htpasswd",
  ".svg", // Can contain JavaScript
  ".xml", // Can contain XXE
]);

/** Dangerous MIME types. */
const DANGEROUS_MIME_TYPES = new Set([
  "application/javascript", "text/javascript",
  "application/x-javascript", "application/ecmascript",
  "text/ecmascript",
  "application/x-httpd-php", "application/x-php",
  "application/x-sh", "application/x-csh",
  "application/x-msdownload", "application/x-msdos-program",
  "application/x-executable", "application/x-binary",
]);

/** Sanitizes a filename -- removes path traversal and dangerous characters. */
function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.replace(/^.*[\\/]/, "");

  // Remove null bytes
  let clean = basename.replace(/\x00/g, "");

  // Remove or replace dangerous characters
  clean = clean.replace(/[<>:"|?*]/g, "_");

  // Remove leading dots (hidden files on Unix)
  clean = clean.replace(/^\.+/, "");

  // Limit length
  if (clean.length > 255) {
    const ext = clean.lastIndexOf(".");
    if (ext > 0) {
      clean = clean.slice(0, 252 - (clean.length - ext)) + clean.slice(ext);
    } else {
      clean = clean.slice(0, 255);
    }
  }

  return clean || "unnamed";
}

/** Gets file extension from filename. */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return filename.slice(lastDot).toLowerCase();
}

/** Detects file type from magic bytes. */
function detectFileType(data: Uint8Array): string | null {
  for (const { ext, mime, signature, maxSignatureOffset } of FILE_SIGNATURES) {
    const offset = maxSignatureOffset ?? 0;
    if (data.length < offset + signature.length) continue;

    let match = true;
    for (let i = 0; i < signature.length; i++) {
      if (data[offset + i] !== signature[i]) {
        match = false;
        break;
      }
    }

    if (match) return mime;
  }

  return null;
}

/**
 * Content Security Protector -- validates file uploads, MIME types,
 * and content disposition to prevent content-based attacks.
 */
export class ContentSecurityProtector {
  private allowedExtensions: Set<string> | null;
  private blockedExtensions: Set<string>;
  private allowedMimeTypes: Set<string> | null;
  private blockedMimeTypes: Set<string>;
  private maxSize: number;
  private verifySignature: boolean;

  constructor(options: {
    allowedExtensions?: string[];
    blockedExtensions?: string[];
    allowedMimeTypes?: string[];
    blockedMimeTypes?: string[];
    maxSize?: number; // bytes
    verifySignature?: boolean;
  } = {}) {
    this.allowedExtensions = options.allowedExtensions
      ? new Set(options.allowedExtensions.map(e => e.toLowerCase()))
      : null;
    this.blockedExtensions = new Set([
      ...Array.from(DANGEROUS_EXTENSIONS),
      ...(options.blockedExtensions ?? []).map(e => e.toLowerCase()),
    ]);
    this.allowedMimeTypes = options.allowedMimeTypes
      ? new Set(options.allowedMimeTypes)
      : null;
    this.blockedMimeTypes = new Set([
      ...Array.from(DANGEROUS_MIME_TYPES),
      ...(options.blockedMimeTypes ?? []),
    ]);
    this.maxSize = options.maxSize ?? 10485760; // 10MB default
    this.verifySignature = options.verifySignature ?? true;
  }

  /** Validates a file upload. */
  validateUpload(filename: string, data: Uint8Array, declaredType?: string): UploadValidationResult {
    const sanitized = sanitizeFilename(filename);
    const ext = getExtension(sanitized);

    // Check file size
    if (data.length > this.maxSize) {
      return {
        allowed: false,
        reason: `File too large: ${data.length} bytes (max: ${this.maxSize})`,
        sanitizedFilename: sanitized,
        detectedType: declaredType ?? "unknown",
        risk: "medium",
      };
    }

    // Check for empty files
    if (data.length === 0) {
      return {
        allowed: false,
        reason: "Empty file",
        sanitizedFilename: sanitized,
        detectedType: "unknown",
        risk: "low",
      };
    }

    // Check blocked extensions
    if (this.blockedExtensions.has(ext)) {
      return {
        allowed: false,
        reason: `Blocked file extension: ${ext}`,
        sanitizedFilename: sanitized,
        detectedType: declaredType ?? "unknown",
        risk: "high",
      };
    }

    // Check allowed extensions
    if (this.allowedExtensions && ext && !this.allowedExtensions.has(ext)) {
      return {
        allowed: false,
        reason: `Extension not in allowlist: ${ext}`,
        sanitizedFilename: sanitized,
        detectedType: declaredType ?? "unknown",
        risk: "medium",
      };
    }

    // Check declared MIME type
    if (declaredType && this.blockedMimeTypes.has(declaredType)) {
      return {
        allowed: false,
        reason: `Blocked MIME type: ${declaredType}`,
        sanitizedFilename: sanitized,
        detectedType: declaredType,
        risk: "high",
      };
    }

    // Check allowed MIME types
    if (declaredType && this.allowedMimeTypes && !this.allowedMimeTypes.has(declaredType)) {
      return {
        allowed: false,
        reason: `MIME type not in allowlist: ${declaredType}`,
        sanitizedFilename: sanitized,
        detectedType: declaredType,
        risk: "medium",
      };
    }

    // Verify file signature
    if (this.verifySignature) {
      const detectedType = detectFileType(data);

      if (detectedType) {
        // Check if detected type is dangerous
        if (this.blockedMimeTypes.has(detectedType)) {
          return {
            allowed: false,
            reason: `File content matches dangerous type: ${detectedType}`,
            sanitizedFilename: sanitized,
            detectedType,
            risk: "high",
          };
        }

        // Check for MIME type mismatch (declared vs actual)
        if (declaredType && declaredType !== detectedType) {
          // Some types have multiple valid MIME types
          const compatible = this.isCompatibleType(declaredType, detectedType);
          if (!compatible) {
            return {
              allowed: false,
              reason: `MIME type mismatch: declared '${declaredType}' but content is '${detectedType}'`,
              sanitizedFilename: sanitized,
              detectedType,
              risk: "medium",
            };
          }
        }

        return {
          allowed: true,
          reason: "File validated",
          sanitizedFilename: sanitized,
          detectedType,
          risk: "none",
        };
      }
    }

    return {
      allowed: true,
      reason: "File passed basic checks",
      sanitizedFilename: sanitized,
      detectedType: declaredType ?? "unknown",
      risk: "low",
    };
  }

  /** Checks if two MIME types are compatible. */
  private isCompatibleType(declared: string, detected: string): boolean {
    // Normalize
    const d = declared.toLowerCase().split(";")[0].trim();
    const t = detected.toLowerCase().split(";")[0].trim();

    if (d === t) return true;

    // JPEG compatibility
    if (d === "image/jpg" && t === "image/jpeg") return true;
    if (d === "image/jpeg" && t === "image/jpg") return true;

    // Check if they share the same type prefix
    const [dType] = d.split("/");
    const [tType] = t.split("/");
    if (dType === tType && dType === "image") return true;

    return false;
  }

  /** Returns Content-Disposition header value for a download. */
  getContentDisposition(filename: string, inline: boolean = false): string {
    const sanitized = sanitizeFilename(filename);
    const type = inline ? "inline" : "attachment";

    // RFC 5987 encoding for non-ASCII filenames
    const encoded = encodeURIComponent(sanitized);
    const ascii = sanitized.replace(/[^\x20-\x7E]/g, "_");

    return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
  }

  /** Returns safe Content-Type header value. */
  getContentType(filename: string, fallback: string = "application/octet-stream"): string {
    const ext = getExtension(filename);
    for (const { ext: exts, mime } of FILE_SIGNATURES) {
      if (exts.includes(ext.replace(".", ""))) {
        return mime;
      }
    }
    return fallback;
  }

  /** Checks if a content type is safe. */
  isContentTypeSafe(contentType: string): boolean {
    const type = contentType.toLowerCase().split(";")[0].trim();
    return !this.blockedMimeTypes.has(type);
  }
}

/** Creates a new content security protector. */
export function createContentProtector(options?: ConstructorParameters<typeof ContentSecurityProtector>[0]): ContentSecurityProtector {
  return new ContentSecurityProtector(options);
}
