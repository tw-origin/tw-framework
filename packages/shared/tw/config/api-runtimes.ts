/**
 * API runtime (strategies.api.runtime): where a `.twm` handler runs.
 *
 *   node  (default) -- the server's own process; every Node/Bun API is available.
 *   edge            -- a V8 isolate: no filesystem, no native modules, no
 *                      child processes. The build refuses to ship an edge
 *                      handler that reaches for one, so a deploy never breaks
 *                      at run time.
 */

export type ApiRuntimeName = "node" | "edge";

export interface ApiRuntimeInfo {
  runtime: ApiRuntimeName;
  detail: string;
}

/** Modules an edge isolate cannot provide. */
export const EDGE_UNSAFE_MODULES = new Set([
  "fs", "node:fs", "fs/promises", "node:fs/promises",
  "child_process", "node:child_process",
  "net", "node:net", "tls", "node:tls", "dgram", "node:dgram",
  "worker_threads", "node:worker_threads",
  "cluster", "node:cluster", "vm", "node:vm",
  "os", "node:os", "module", "node:module",
  "v8", "node:v8", "inspector", "node:inspector",
  "perf_hooks", "node:perf_hooks",
  "readline", "node:readline", "repl", "node:repl",
  "wasi", "node:wasi", "process", "node:process",
]);

/** Globals / calls an edge isolate cannot provide. */
const EDGE_UNSAFE_GLOBALS: Array<[RegExp, string]> = [
  [/\brequire\s*\(/, "require()"],
  [/\bprocess\.(env|argv|exit|cwd|platform)\b/, "process.*"],
  [/\bBuffer\b/, "Buffer"],
  [/\b__dirname\b|\b__filename\b/, "__dirname/__filename"],
  [/\bimport\s*\(\s*["']\.?\/?[^"']+\.node["']/, "native .node addon"],
];

export interface EdgeViolation {
  file: string;
  what: string;
  line: number;
}

/** Is the selected api runtime usable? (Both always are -- they are choices.) */
export function detectApiRuntime(runtime: string): ApiRuntimeInfo {
  if (runtime === "edge") return { runtime: "edge", detail: "V8 isolate -- no fs, no native modules" };
  return { runtime: "node", detail: "the server process -- every Node/Bun API" };
}

/** Resolve the configured api runtime, defaulting to node. */
export function resolveApiRuntime(cfg: any): ApiRuntimeName {
  const r = cfg?.strategies?.api?.runtime;
  return r === "edge" ? "edge" : "node";
}

/**
 * Find everything in a `.twm` source that an edge isolate cannot provide.
 * Comments and strings are stripped first so a mention in prose does not count.
 */
export function checkEdgeSafety(source: string, filePath: string): EdgeViolation[] {
  const out: EdgeViolation[] = [];
  const stripped = stripCommentsAndStrings(source);
  // Specifiers live inside string literals, so scan a version that only has
  // COMMENTS removed (strings intact); globals use the fully stripped source.
  const noComments = stripCommentsOnly(source);

  // import ... from "<spec>" / require("<spec>")
  const specRe = /(?:from|require\s*\()\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = specRe.exec(noComments))) {
    const spec = m[1];
    const bare = spec.replace(/^node:/, "");
    if (EDGE_UNSAFE_MODULES.has(spec) || EDGE_UNSAFE_MODULES.has(bare)) {
      const line = lineOf(source, m.index);
      out.push({ file: filePath, what: `import "${spec}"`, line });
    }
  }
  for (const [re, label] of EDGE_UNSAFE_GLOBALS) {
    const hit = re.exec(stripped);
    if (hit) out.push({ file: filePath, what: label, line: lineOf(source, hit.index) });
  }
  // de-duplicate by what+line
  const seen = new Set<string>();
  return out.filter((v) => {
    const k = v.what + ":" + v.line;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.line - b.line);
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

/** Remove comments only, keeping string literals (offsets preserved). */
function stripCommentsOnly(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") { out[i] = " "; i++; } continue; }
    if (c === "/" && src[i + 1] === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] !== "\n") out[i] = " "; i++; }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Replace string literals and comments with spaces, keeping offsets intact. */
function stripCommentsAndStrings(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") { out[i] = " "; i++; } continue; }
    if (c === "/" && src[i + 1] === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] !== "\n") out[i] = " "; i++; }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out[i] = " "; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") { out[i] = " "; i++; if (i < n) { out[i] = " "; i++; } continue; } if (src[i] !== "\n") out[i] = " "; i++; }
      if (i < n) { out[i] = " "; i++; }
      continue;
    }
    i++;
  }
  return out.join("");
}
