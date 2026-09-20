/** Timing attack prevention module. */

export { TimingProtector, constantTimeCompare, constantTimeCompareBytes, constantTimeCompareNumbers, createTimingProtector } from "./protector";
export type { TimingConfig } from "./protector";
