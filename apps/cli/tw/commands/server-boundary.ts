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
import { dirname, resolve, extname, relative, sep } from "node:path";
import * as ts from "typescript";

export const SERVER_ONLY_MARKER = "@tw/server-only";
/**
 * The opposite marker: a module that is safe for both server and client.
 * `lib/` is server-only by default, and this is the explicit opt-out for a
 * shared helper that lives there.
 */
export const CLIENT_SAFE_MARKER = "@tw/client-safe";

/** A marker counts whether it is written with double or single quotes. */
function hasMarker(src: string, marker: string): boolean {
  return src.includes(`"${marker}"`) || src.includes(`'${marker}'`);
}

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
export function collectModuleImports(src: string): { specifier: string; kind: string; names: string[] }[] {
  const out: { specifier: string; kind: string; names: string[] }[] = [];
  if (!src.trim()) return out;
  const sf = ts.createSourceFile("m.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = (node: ts.ImportDeclaration): string[] => {
    const clause = node.importClause;
    if (!clause) return []; // side-effect import: nothing bound
    const out2: string[] = [];
    if (clause.name) out2.push(clause.name.text);
    const nb = clause.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) out2.push(nb.name.text);
    else if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) out2.push((el.name ?? el.propertyName)!.text);
    return out2;
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ specifier: node.moduleSpecifier.text, kind: "import", names: names(node) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ specifier: node.moduleSpecifier.text, kind: "export-from", names: [] });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      out.push({ specifier: node.arguments[0].text, kind: "dynamic", names: [] });
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
  // `lib/secret.server` (no extension, as written in an import) is the same
  // server-only module as `lib/secret.server.ts`.
  return /\.server(\.(ts|js|mjs|cjs))?$/.test(spec);
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
  // A4: on a page, an import that is only used inside `server { }` never reaches
  // the client, so it is allowed. `scannable` already has the server regions
  // stripped, so "the name does not appear in scannable" is exactly that test.
  const entrySet = new Set(entryFiles.map((f) => resolve(f)));

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
    // NOTE: the `@tw/server-only` marker is reported by the import loop below,
    // which carries the chain. Reporting it here as well produced the same
    // violation twice for one module.

    for (const imp of collectModuleImports(scannable)) {
      const spec = imp.specifier;
      let layer: string | null = null;

      if (isServerOnlyByName(spec)) layer = "name";
      else if (isLocal(spec)) {
        // `../../lib/db` is the documented way to reach a server module, so a
        // relative path into lib/ must be rejected too -- checking only the
        // `lib/`-prefixed form let the documented import through.
        const resolvedLocal = resolveLocal(spec, dirname(file));
        const libRoot = opts.rootDir ? resolve(opts.rootDir, "lib") : null;
        if (resolvedLocal && libRoot && (resolvedLocal === libRoot || resolvedLocal.startsWith(libRoot + sep))) {
          // `lib/` is server-only by default, but a module inside it can opt out
          // with `import "@tw/client-safe"`. The marker only speaks for that
          // file -- we still walk it, so a server-only dependency it imports is
          // caught with the chain intact.
          let clientSafe = false;
          try { clientSafe = hasMarker(readFileSync(resolvedLocal, "utf8"), CLIENT_SAFE_MARKER); } catch { /* unreadable: treat as server-only */ }
          if (!clientSafe) layer = "lib";
        }
      }
      else if (spec === SERVER_ONLY_MARKER) layer = "L4";
      else if (spec === CLIENT_SAFE_MARKER) continue; // the opt-out marker itself
      else if (spec.startsWith("node:") || DENY_NODE_BUILTINS.has(spec)) layer = "L1";
      else if (matchesOnlyPackages(spec, only)) layer = "L3";
      else if (DEFAULT_DENY_PACKAGES.includes(packageName(spec))) layer = "L2";

      if (layer) {
        // A4: on a page entry, if none of the names this import binds appears in
        // the client-visible source, the import is used only inside server
        // blocks -- allow it and do not descend (nothing of it ships).
        if (entrySet.has(file) && imp.names.length > 0) {
          const usedOnClient = imp.names.some((nm) => new RegExp("\\b" + nm.replace(/[$]/g, "\\$") + "\\b").test(scannable));
          if (!usedOnClient) continue;
        }
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
