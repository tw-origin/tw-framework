/**
 * Server-only boundary for the client graph .
 *
 * Walks the client graph (page + layout chain + every local module they
 * import, recursively, cycle-safe) with the TypeScript parser -- not the
 * line-based regex -- and reports any server-only module reached, with the
 * full import chain.
 *
 * Four layers:
 *   L1 always-denied Node built-ins
 *   L2 default package denylist
 *   L3 tw.config.ts `server.onlyPackages` (exact name or `scope/*`)
 *   L4 the `@tw/server-only` marker
 * plus the by-name rule: any specifier ending in `.server.ts` / `.server.js`.
 *
 * Known limitations:
 *   - The walk does not enter bare packages: a package that re-exports a denied
 *     module is not traced (only local modules are followed).
 *   - `path` and `crypto` are NOT denied (both are common client-side); the
 *     `crypto` "already used client-side" report is not implemented.
 *   - Only used when `experimental.serverBlocks` is on. `tw dev` still uses the
 *     legacy line scan (wiring the walk into dev needs the page file path).
 *
 * Only used when `experimental.serverBlocks` is on; the legacy TW1007 path is
 * untouched when it is off.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname, relative } from "node:path";
import * as ts from "typescript";

export const SERVER_ONLY_MARKER = "@tw/server-only";

/** L1 -- Node built-ins always denied in the client graph.
 * (`path` is intentionally NOT here: it is common client-side and bundlers
 * shim it. `crypto` is likewise allowed -- see the report.) */
export const DENY_NODE_BUILTINS = new Set([
  "fs", "fs/promises", "net", "child_process", "os",
  "tls", "dns", "dns/promises", "cluster", "worker_threads", "http", "https", "http2",
  "dgram", "repl", "readline", "v8", "vm", "inspector", "perf_hooks", "async_hooks",
  "diagnostics_channel", "process", "module", "tty", "zlib", "constants", "sys",
]);

/** L2 -- default package denylist (extend here). */
export const DEFAULT_DENY_PACKAGES = [
  "pg", "pg-native", "mysql", "mysql2", "mongodb", "mongoose", "redis", "ioredis",
  "@prisma/client", "better-sqlite3", "sqlite3", "knex", "sequelize", "typeorm",
  "bcrypt", "nodemailer",
];

const LOCAL_EXT = [".ts", ".js", ".tsx", ".jsx", ".tw"];

export interface BoundaryViolation {
  /** the client module that contains the offending import */
  file: string;
  /** the offending specifier */
  specifier: string;
  /** which layer fired: L1 | L2 | L3 | L4 | name */
  layer: string;
  /** page -> ... -> offending module */
  chain: string[];
}

/** Imports/exports/dynamic-imports with a literal specifier, via the TS parser. */
export function collectModuleImports(src: string): { specifier: string; kind: string }[] {
  const out: { specifier: string; kind: string }[] = [];
  if (!src.trim()) return out;
  const sf = ts.createSourceFile("m.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ specifier: node.moduleSpecifier.text, kind: "import" });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ specifier: node.moduleSpecifier.text, kind: "export-from" });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      out.push({ specifier: node.arguments[0].text, kind: "dynamic" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function isLocal(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@./");
}

/** Resolve a local specifier to a file on disk (with extension probing). */
function resolveLocal(spec: string, fromDir: string): string | null {
  const rel = spec.startsWith("@./") ? spec.slice(2) : spec;
  const base = resolve(fromDir, rel);
  if (existsSync(base) && extname(base)) return base;
  for (const e of LOCAL_EXT) if (existsSync(base + e)) return base + e;
  return null;
}

/** `scope/*` prefix match or exact name. */
function matchesOnlyPackages(spec: string, only: string[]): boolean {
  for (const p of only) {
    if (p.endsWith("/*")) { if (spec.startsWith(p.slice(0, -1))) return true; }
    else if (spec === p) return true;
  }
  return false;
}

function isServerOnlyByName(spec: string): boolean {
  return /\.server\.(ts|js)$/.test(spec);
}

function packageName(spec: string): string {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

export interface WalkOptions {
  onlyPackages?: string[];
  /** The set of .tw files that are part of the graph (components). */
  stripServerRegions?: (src: string) => string;
  rootDir?: string;
}

/**
 * Walk the client graph from `entryFiles` and return every server-only
 * violation, with the import chain.
 */
export function walkClientGraph(entryFiles: string[], opts: WalkOptions = {}): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const seen = new Set<string>();
  const only = opts.onlyPackages ?? [];
  const label = (f: string) => (opts.rootDir && f.startsWith(opts.rootDir) ? relative(opts.rootDir, f) : f);

  const queue: { file: string; chain: string[] }[] = entryFiles.map((f) => ({ file: resolve(f), chain: [label(resolve(f))] }));

  while (queue.length) {
    const { file, chain } = queue.shift()!;
    if (seen.has(file)) continue; // cycle-safe
    seen.add(file);
    if (!existsSync(file)) continue;

    let src: string;
    try { src = readFileSync(file, "utf8"); } catch { continue; }
    // Server blocks never count toward the client graph.
    const scannable = opts.stripServerRegions ? opts.stripServerRegions(src) : src;

    // L4 marker: a module importing @tw/server-only is server-only.
    if (scannable.includes(`"${SERVER_ONLY_MARKER}"`) || scannable.includes(`'${SERVER_ONLY_MARKER}'`)) {
      violations.push({ file, specifier: SERVER_ONLY_MARKER, layer: "L4", chain: [...chain, SERVER_ONLY_MARKER] });
    }

    for (const imp of collectModuleImports(scannable)) {
      const spec = imp.specifier;
      let layer: string | null = null;

      if (isServerOnlyByName(spec)) layer = "name";
      else if (isLocal(spec)) layer = null; // walk it
      else if (spec === SERVER_ONLY_MARKER) layer = "L4";
      else if (spec.startsWith("node:") || DENY_NODE_BUILTINS.has(spec)) layer = "L1";
      else if (matchesOnlyPackages(spec, only)) layer = "L3";
      else if (DEFAULT_DENY_PACKAGES.includes(packageName(spec))) layer = "L2";

      if (layer) {
        violations.push({ file, specifier: spec, layer, chain: [...chain, spec] });
        continue; // do not descend into a server-only module
      }

      if (isLocal(spec)) {
        const local = resolveLocal(spec, dirname(file));
        if (local) queue.push({ file: local, chain: [...chain, label(local)] });
      }
    }
  }

  return violations;
}

/** Human-readable chain, e.g. `page.tw -> islands/Cart.tsx -> lib/db.server.ts`. */
export function formatChain(v: BoundaryViolation): string {
  return v.chain.join(" -> ");
}

/**
 * The dev-mode server-only boundary check: the same transitive walk build uses,
 * returned as formatted messages so the caller can log them non-fatally.
 * Server-block regions are stripped first so a block's own imports are never
 * mistaken for client imports.
 */
export async function devServerOnlyBoundary(rootDir: string, entryFiles: string[], onlyPackages?: string[]): Promise<string[]> {
  let strip: ((src: string) => string) | undefined;
  try {
    const compiler: any = await import("@tw/compiler");
    if (compiler?.parseWithDetails && compiler?.collectServerBlocks && compiler?.stripServerBlockRegions) {
      strip = (src: string) => {
        try {
          const prog = compiler.parseWithDetails(src, { filePath: "<scan>", cache: false, experimental: { serverBlocks: true } }).program;
          const blocks = compiler.collectServerBlocks(prog);
          return blocks.length ? compiler.stripServerBlockRegions(src, blocks) : src;
        } catch { return src; }
      };
    }
  } catch { /* compiler unavailable in this context */ }
  const viols = walkClientGraph(entryFiles, { rootDir, onlyPackages, stripServerRegions: strip });
  return viols.map((v) => `${v.layer}:${v.specifier}  [${formatChain(v)}]`);
}
