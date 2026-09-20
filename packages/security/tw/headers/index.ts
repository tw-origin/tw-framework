/** Headers module -- security headers, HSTS. */

export { HSTSManager, createHSTSManager } from "./hsts";
export type { HSTSConfig, HSTSDomain } from "./hsts";
export { SecurityHeaders, createSecurityHeaders, devSecurityHeaders, strictSecurityHeaders } from "./security-headers";
export type { SecurityHeadersConfig } from "./security-headers";
