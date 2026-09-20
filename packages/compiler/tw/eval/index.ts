/** Eval barrel - re-exports from split sub-modules. */

export { applyFilter, callBuiltin } from "./builtins";
export { coerce, evaluate, inferType, isTruthy } from "./evaluate";
export { interpolate } from "./interpolate";
export { Sandbox } from "./sandbox";
export type { SandboxOptions } from "./sandbox";
