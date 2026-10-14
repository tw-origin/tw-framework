/**
 * Component-registry seeding, shared by `tw build`, `tw dev` and `tw check`.
 *
 * The codegen resolves a component tag through the compiler's component
 * registry, so every command that compiles a page must seed it first -- from
 * the same files. This is that one seeding path: `components/` plus the
 * private `_components/` folders co-located with routes. A command that
 * compiles pages without seeding it reports every imported component as
 * "unknown".
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface ComponentRegistryApi {
  compileSync: (source: string, opts: Record<string, unknown>) => { ast?: unknown };
  registerComponentTemplate: (name: string, ast: unknown) => void;
  clearComponentRegistry: () => void;
}

/** Compile each `.tw` in `dir` and register it under its file name. */
export function registerComponentsFrom(
  dir: string,
  api: ComponentRegistryApi,
  onRegistered?: (name: string) => void,
  onError?: (name: string, message: string) => void,
): void {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tw"))) {
    const name = file.replace(/\.tw$/, "");
    const filePath = join(dir, file);
    try {
      const source = readFileSync(filePath, "utf-8");
      const result = api.compileSync(source, { filePath, transforms: false, optimize: false, diagnostics: false });
      if (result.ast) {
        api.registerComponentTemplate(name, result.ast);
        onRegistered?.(name);
      }
    } catch (e: any) {
      onError?.(name, e?.message ?? String(e));
    }
  }
}

/** Route groups and `@`-folders are skipped; `_`-folders hold private components. */
export function collectPrivateComponentDirs(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (entry.startsWith("_")) out.push(full);
    else if (!entry.startsWith("@")) collectPrivateComponentDirs(full, out);
  }
}

/**
 * Seed the codegen component registry. Clears first, so a re-scan (dev reload)
 * never leaves a removed component behind.
 */
export function scanComponents(
  rootDir: string,
  api: ComponentRegistryApi,
  onRegistered?: (name: string) => void,
  onError?: (name: string, message: string) => void,
): void {
  api.clearComponentRegistry();
  registerComponentsFrom(join(rootDir, "components"), api, onRegistered, onError);
  const privDirs: string[] = [];
  collectPrivateComponentDirs(join(rootDir, "home"), privDirs);
  for (const d of privDirs) registerComponentsFrom(d, api, onRegistered, onError);
}

/** Resolve a `.tw` import specifier to a file, or null for a bare package name. */
function resolveTwSpecifier(spec: string, pageDir: string, rootDir: string): string | null {
  // `@./x` and `@/x` are both project-root aliases; `./`/`../` are page-relative.
  if (spec.startsWith("@./") || spec.startsWith("@/")) return join(rootDir, spec.replace(/^@\.?\//, ""));
  if (spec.startsWith("./" ) || spec.startsWith("../")) return resolve(pageDir, spec);
  return null;
}

/**
 * Register the `.tw` components a page imports by path. A component that lives
 * outside `components/` (say `lib/Gate.tw`) is not in the directory scan, so
 * without this its tag compiles as "unknown" -- the import is what should
 * resolve it. The import name is the tag, so it is registered under that.
 */
export function registerImportedComponents(
  pageFile: string,
  rootDir: string,
  api: ComponentRegistryApi,
  source: string,
  onRegistered?: (name: string) => void,
): void {
  const pageDir = dirname(pageFile);
  for (const m of source.matchAll(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.tw)["']/gm)) {
    const name = m[1];
    const file = resolveTwSpecifier(m[2], pageDir, rootDir);
    if (!file || !existsSync(file)) continue;
    try {
      const result = api.compileSync(readFileSync(file, "utf-8"), { filePath: file, transforms: false, optimize: false, diagnostics: false });
      if (result.ast) {
        api.registerComponentTemplate(name, result.ast);
        onRegistered?.(name);
      }
    } catch {
      /* leave the tag unknown rather than failing the whole page */
    }
  }
}
