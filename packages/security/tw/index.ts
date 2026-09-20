/** Security package -- comprehensive security suite for TW Framework. */

// CSP module

// CSRF module

// Rate limiting module

// Sanitize module

// CORS module

// Headers module

// Auth module

// Encryption module

// Cookies module

// Permissions module

// Validation module

// Audit module

// Bot detection module

// Injection prevention module

// XSS module

// Path traversal module

// SSRF protection module

// Redirect prevention module

// HTTP request smuggling module

// Timing attack prevention module

// Content security module

// Re-export escapeHtml for backward compatibility

export { CSPBuilder, CSRFProtection, InputValidator, RateLimiter, XSSSanitizer } from "./policy";
export type { CSPDirective, CSPSource, RateLimitConfig } from "./policy";
export { JWTManager, PasswordPolicy, SQLInjectionDetector, XSSDetector, createJWTManager, createPasswordPolicy, createSQLInjectionDetector, createXSSDetector } from "./xss-detector";
export type { XSSDetectionResult } from "./xss-detector";
export { AuditLogger, createAuditLogger } from "./audit";
export type { AuditConfig, AuditEvent, AuditFilter } from "./audit";
export { MemorySessionStore, PasswordManager, SessionManager, createPasswordManager, createSessionManager } from "./auth";
export type { JWTConfig, JWTHeader, JWTPayload, JWTToken, JWTVerifyOptions, JWTVerifyResult, PasswordConfig, PasswordHashResult, PasswordStrengthResult, SessionConfig, SessionData, SessionStore } from "./auth";
export { BotDetector, createBotDetector } from "./bot-detection";
export type { BotDetectionResult, BotDetectorConfig } from "./bot-detection";
export { ContentSecurityProtector, createContentProtector } from "./content-security";
export type { ContentTypeResult, UploadValidationResult } from "./content-security";
export { SecureCookieManager, createCookieManager } from "./cookies";
export type { CookieManagerConfig, CookieOptions, ParsedCookie } from "./cookies";
export { CORSHandler, createCORSHandler, permissiveCORS, strictCORS } from "./cors";
export type { CORSConfig, CORSResult } from "./cors";
// NOTE: the CSP module also defines a builder-style `SecurityHeaders` class;
// the canonical SecurityHeaders / createSecurityHeaders exports come from
// ./headers (the Response-oriented implementation) to avoid a name collision.
export { CSPManager, CSPPolicyBuilder, CSPViolationReporter, NonceManager, createCSPManager, createCSPPolicy, createCSRFProtection, createNonceManager, createRateLimiter, createViolationReporter, devCSP, nonceMiddleware, strictCSP } from "./csp";
export type { CSPBuildResult, CSPDirectives, CSPOptions, CSPReport, CSPRouteOverrides, CSPViolationReport, DirectiveStats, NonceContext, NonceManagerOptions, ViolationReporterOptions, ViolationSummary } from "./csp";
export { CSRFMiddleware, CSRFTokenManager, createCSRFManager, createCSRFMiddleware } from "./csrf";
export type { CSRFContext, CSRFExemptPaths, CSRFMiddlewareOptions, CSRFMiddlewareResult, CSRFToken, CSRFTokenOptions, CSRFValidationResult } from "./csrf";
export { AESEncryption, Hashing, createAESEncryption, hmacSha256, randomToken, sha256 } from "./encryption";
export type { AESConfig, AESKeyMaterial, EncryptionResult, HashAlgorithm } from "./encryption";
export { HSTSManager, SecurityHeaders, createHSTSManager, createSecurityHeaders, devSecurityHeaders, strictSecurityHeaders } from "./headers";
export type { HSTSConfig, HSTSDomain, SecurityHeadersConfig } from "./headers";
export { CommandInjectionDetector, LDAPInjectionDetector, NoSQLInjectionDetector, XPathInjectionDetector, createCommandDetector, createLDAPDetector, createNoSQLDetector, createSQLDetector, createXPathDetector } from "./injection";
export type { CommandDetectionResult, LDAPDetectionResult, NoSQLDetectionResult, SQLDetectionResult, XPathDetectionResult } from "./injection";
export { PathTraversalPreventer, createPathPreventer } from "./path-traversal";
export type { PathTraversalResult } from "./path-traversal";
export { ACLManager, RBACManager, createACL, createRBAC, perm } from "./permissions";
export type { ACLCheckResult, ACLEntry, AccessResult, Permission, Role, UserAssignment } from "./permissions";
export { FixedWindowLimiter, RateLimitMiddleware, SlidingWindowLimiter, TokenBucketLimiter, apiKeyKeyExtractor, createFixedWindow, createRateLimitMiddleware, createSlidingWindow, createTokenBucket, defaultKeyExtractor, pathKeyExtractor } from "./rate-limit";
export type { AnyLimiter, FixedWindowOptions, KeyExtractor, RateLimitErrorResponse, RateLimitMiddlewareOptions, RateLimitResult, SlidingWindowOptions, SlidingWindowResult, TokenBucketOptions } from "./rate-limit";
export { RedirectPreventer, createRedirectPreventer } from "./redirect";
export type { RedirectConfig, RedirectResult } from "./redirect";
export { HTMLSanitizer, URLSanitizer, createSanitizer, createURLSanitizer, escapeAttribute, escapeCss, escapeHtml, escapeJavaScript, escapeUrl, unescapeHtml } from "./sanitize";
export type { SanitizeResult, SanitizerConfig, UrlSanitizeResult } from "./sanitize";
export { SmugglingPreventer, createSmugglingPreventer } from "./smuggling";
export type { SmugglingConfig, SmugglingResult } from "./smuggling";
export { SSRFProtector, createSSRFProtector } from "./ssrf";
export type { SSRFConfig, SSRFResult } from "./ssrf";
export { TimingProtector, constantTimeCompare, constantTimeCompareBytes, constantTimeCompareNumbers, createTimingProtector } from "./timing";
export type { TimingConfig } from "./timing";
export { SchemaValidator, createValidator, patterns, validators } from "./validation";
export type { FieldSchema, Schema, ValidationError, ValidationResult } from "./validation";
export { XSSPrevention, createXSSPrevention } from "./xss";
export type { OutputContext, PreventionResult } from "./xss";
