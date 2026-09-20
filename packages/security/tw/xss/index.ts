/** XSS module -- detection and prevention. */

export { XSSDetector, createXSSDetector } from "./detector";
export type { XSSDetectionResult } from "./detector";
export { XSSPrevention, createXSSPrevention } from "./prevention";
export type { OutputContext, PreventionResult } from "./prevention";
