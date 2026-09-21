/**
 * tw dev -- Development server.
 * Core router: serves .tw pages, .twm API routes, static files.
 * Reads middleware.twm for route protection rules.
 * No business logic -- all app code lives in home/, lib/, components/.
 */

import { join, resolve, dirname } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

// --- Compiler loader ---------------------------------------------------------

function findCompilerPath(): string {
  const fileUrl = import.meta.url.replace("file://", "");
  const cmdDir = fileUrl.substring(0, fileUrl.lastIndexOf("/"));
  const candidates = [
    resolve(cmdDir, "../../../../packages/compiler/tw/index.ts"),
    resolve(process.cwd(), "packages/compiler/tw/index.ts"),
    resolve(process.cwd(), "node_modules/tw-framework/packages/compiler/tw/index.ts"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return resolve(process.cwd(), "packages/compiler/tw/index.ts");
}

let { compileSync, registerComponentTemplate, clearComponentRegistry, generateWithLayout, generateWithLayoutChain, compileTSS: _compileTSS, beginCssRouteCapture, endCssRouteCapture, getCapturedCssRoutes, getCssChunks, hashCss, routeToCssName } = { compileSync: null, registerComponentTemplate: null, clearComponentRegistry: null, generateWithLayout: null, generateWithLayoutChain: null, compileTSS: null, beginCssRouteCapture: null, endCssRouteCapture: null, getCapturedCssRoutes: null, getCssChunks: null, hashCss: null, routeToCssName: null };
try {
  const _m = await import("../../../../packages/compiler/tw/index.ts");
  compileSync = _m.compileSync; registerComponentTemplate = _m.registerComponentTemplate;
  clearComponentRegistry = _m.clearComponentRegistry; generateWithLayout = _m.generateWithLayout;
  generateWithLayoutChain = _m.generateWithLayoutChain; _compileTSS = _m.compileTSS; beginCssRouteCapture = _m.beginCssRouteCapture; endCssRouteCapture = _m.endCssRouteCapture; getCapturedCssRoutes = _m.getCapturedCssRoutes; getCssChunks = _m.getCssChunks; hashCss = _m.hashCss; routeToCssName = _m.routeToCssName;
} catch {
  const _m: any = await import(findCompilerPath());
  compileSync = _m.compileSync; registerComponentTemplate = _m.registerComponentTemplate;
  clearComponentRegistry = _m.clearComponentRegistry; generateWithLayout = _m.generateWithLayout;
  generateWithLayoutChain = _m.generateWithLayoutChain; _compileTSS = _m.compileTSS; beginCssRouteCapture = _m.beginCssRouteCapture; endCssRouteCapture = _m.endCssRouteCapture; getCapturedCssRoutes = _m.getCapturedCssRoutes; getCssChunks = _m.getCssChunks; hashCss = _m.hashCss; routeToCssName = _m.routeToCssName;
}

// Route stylesheets captured per request: <name> -> css, served at /assets/.
const DEV_CSS_FILES = new Map<string, string>();

/** Build this route's stylesheet (content-hashed) and return it linked into <head>. */
function injectDevCss(html: string, route: string): string {
  try {
    if (typeof getCapturedCssRoutes !== "function" || typeof getCssChunks !== "function") return html;
    const ids = getCapturedCssRoutes().get(route);
    if (!ids || ids.length === 0) return html;
    const chunks = getCssChunks();
    const css = ids.map((id: string) => chunks.get(id)).filter(Boolean).join("\n");
    if (!css) return html;
    const name = routeToCssName(route) + "." + hashCss(css) + ".css";
    DEV_CSS_FILES.set(name, css);
    return html.replace("</head>", `  <link rel="stylesheet" href="/assets/${name}">\n</head>`);
  } catch { return html; }
}

// --- Route helpers ------------------------------------------------------------

/**
 * Resolve a pathname to a file inside home/ -- supports ALL documented
 * routing patterns: exact dirs, route groups (marketing)/, dynamic [param],
 * catch-all [...rest] (1+ segments) and optional catch-all [[...cat]] (0+).
 */
function resolveHomeFile(homeDir: string, pathname: string, leafNames: string[]): { file: string; params: Record<string, string> } | null {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const isDir = (p: string) => {
    try { return existsSync(p) && statSync(p).isDirectory(); } catch { return false; }
  };
  const listDir = (p: string): string[] => {
    try { return existsSync(p) ? readdirSync(p) : []; } catch { return []; }
  };

  function walk(dir: string, i: number, params: Record<string, string>): { file: string; params: Record<string, string> } | null {
    // Consumed all segments: check leaf files here
    if (i >= segments.length) {
      for (const leaf of leafNames) {
        const f = join(dir, leaf);
        if (existsSync(f)) return { file: f, params };
      }
      // Optional catch-all with zero remaining segments
      for (const entry of listDir(dir)) {
        const m = /^\[\[\.\.\.(.+)\]\]$/.exec(entry);
        if (m && isDir(join(dir, entry))) {
          for (const leaf of leafNames) {
            const f = join(dir, entry, leaf);
            if (existsSync(f)) return { file: f, params: { ...params, [m[1]]: "" } };
          }
        }
      }
      return null;
    }

    const seg = segments[i];

    // 1. Exact directory
    const exact = join(dir, seg);
    if (isDir(exact)) {
      const r = walk(exact, i + 1, params);
      if (r) return r;
    }

    // 2. Route groups (name)/ -- same segment, hidden folder
    for (const entry of listDir(dir)) {
      if (/^\(.*\)$/.test(entry) && isDir(join(dir, entry))) {
        const r = walk(join(dir, entry), i, params);
        if (r) return r;
      }
    }

    // 3. Dynamic [param] directory
    for (const entry of listDir(dir)) {
      const m = /^\[([^\].]+)\]$/.exec(entry);
      if (m && isDir(join(dir, entry))) {
        const r = walk(join(dir, entry), i + 1, { ...params, [m[1]]: seg });
        if (r) return r;
      }
    }

    // 4. Catch-all [...rest] (1+ segments) and optional [[...rest]] (0+, handled above for zero)
    for (const entry of listDir(dir)) {
      const m = /^\[\.\.\.(.+)\]$/.exec(entry) || /^\[\[\.\.\.(.+)\]\]$/.exec(entry);
      if (m && isDir(join(dir, entry))) {
        for (const leaf of leafNames) {
          const f = join(dir, entry, leaf);
          if (existsSync(f)) return { file: f, params: { ...params, [m[1]]: segments.slice(i).join("/") } };
        }
      }
    }

    // 5. seg.tw file at this level (last segment only)
    if (i === segments.length - 1) {
      const f = join(dir, seg + ".tw");
      if (existsSync(f)) return { file: f, params };
    }
    return null;
  }

  return walk(homeDir, 0, {});
}

/** Find the nearest layout.tw walking from dir up to homeDir. */
function findLayoutDev(dir: string, homeDir: string): string | null {
  let cur = dir;
  const homeAbs = resolve(homeDir);
  for (let i = 0; i < 16; i++) {
    const cand = join(cur, "layout.tw");
    if (existsSync(cand)) return cand;
    if (resolve(cur) === homeAbs) break;
    const parent = resolve(cur, "..");
    if (parent === resolve(cur) || !parent.startsWith(homeAbs)) break;
    cur = parent;
  }
  return null;
}

// --- Component scanner -------------------------------------------------------
// Scans components/ directory, compiles each .tw file, registers in codegen registry.
// This allows <Header /> or Header { } in pages to inline the component's HTML.

function registerComponentsFrom(rootDir: string, dir: string): void {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter(f => f.endsWith(".tw"))) {
    const name = file.replace(/\.tw$/, "");
    const filePath = join(dir, file);
    try {
      const source = readFileSync(filePath, "utf-8");
      const result = compileSync(source, { filePath, transforms: false, optimize: false, diagnostics: false });
      if (result.ast) {
        registerComponentTemplate(name, result.ast);
      }
    } catch (e: any) {
      console.log("    Warning: Failed to compile component " + file + ": " + e.message);
    }
  }
}

function collectPrivateComponentDirs(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!existsSync(full)) continue;
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    if (entry.startsWith("_")) {
      out.push(full);
    } else if (!entry.startsWith("@")) {
      collectPrivateComponentDirs(full, out);
    }
  }
}

function scanComponents(rootDir: string): void {
  clearComponentRegistry();
  // Global components/
  registerComponentsFrom(rootDir, join(rootDir, "components"));
  // Private folders co-located with routes: home/(marketing)/_components/Hero.tw
  const privDirs: string[] = [];
  collectPrivateComponentDirs(join(rootDir, "home"), privDirs);
  for (const d of privDirs) registerComponentsFrom(rootDir, d);
}

// Re-scan components when the components/ dir changes (added/edited files),
// so newly created components work without restarting `tw dev`.
let _compSignature = "";
function rescanComponentsIfNeeded(rootDir: string): void {
  let sig = "";
  const addDir = (dir: string) => {
    try {
      for (const f of readdirSync(dir).filter(f => f.endsWith(".tw"))) {
        sig += dir + "/" + f + ":" + statSync(join(dir, f)).mtimeMs + ";";
      }
    } catch { /* no dir */ }
  };
  addDir(join(rootDir, "components"));
  const privDirs: string[] = [];
  collectPrivateComponentDirs(join(rootDir, "home"), privDirs);
  for (const d of privDirs) addDir(d);
  if (sig !== _compSignature) {
    _compSignature = sig;
    scanComponents(rootDir);
  }
}

// --- Default CSS --------------------------------------------------------------

const DEFAULT_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
a { text-decoration: none; color: inherit; }
ul { list-style: none; }
img { max-width: 100%; height: auto; }
.site-header { background: #1a1a2e; color: #fff; padding: 1rem 0; position: sticky; top: 0; z-index: 100; }
.navbar { display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 1.5rem; font-weight: bold; color: #e94560; }
.nav-links { display: flex; gap: 2rem; }
.nav-links a { color: #fff; transition: color 0.3s; }
.nav-links a:hover { color: #e94560; }
.hero { background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; padding: 4rem 0; text-align: center; }
.hero h1 { font-size: 2.5rem; margin-bottom: 1rem; }
.hero p { font-size: 1.2rem; margin-bottom: 2rem; opacity: 0.9; }
.btn { display: inline-block; background: #e94560; color: #fff; padding: 0.75rem 2rem; border-radius: 8px; font-weight: 600; transition: background 0.3s; cursor: pointer; border: none; font-size: 1rem; }
.btn:hover { background: #c73e54; }
.features .container { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; }
.features { padding: 4rem 0; background: #f8f9fa; }
.features h2 { text-align: center; margin-bottom: 3rem; }
.feature-card { text-align: center; padding: 2rem; }
.feature-card img { width: 64px; height: 64px; margin-bottom: 1rem; }
.products, .products-page { padding: 4rem 0; }
.products h2, .products-page h1 { text-align: center; margin-bottom: 3rem; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; }
.product-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; transition: transform 0.3s, box-shadow 0.3s; }
.product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
.product-card img { width: 100%; height: 200px; object-fit: cover; background: #f0f0f0; }
.product-info { padding: 1.5rem; }
.product-info p { color: #666; margin-bottom: 0.5rem; }
.product-info p.price { color: #e94560; font-weight: 700; font-size: 1.2rem; margin-bottom: 1rem; }
.newsletter { background: #1a1a2e; color: #fff; padding: 4rem 0; text-align: center; }
.newsletter h2 { margin-bottom: 1rem; }
.newsletter p { margin-bottom: 2rem; opacity: 0.9; }
.newsletter form { display: flex; gap: 1rem; justify-content: center; }
.newsletter input { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; min-width: 300px; font-size: 1rem; }
.newsletter button { cursor: pointer; border: none; font-size: 1rem; }
.about { padding: 4rem 0; }
.about h1 { text-align: center; margin-bottom: 2rem; }
.about-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; margin: 3rem 0; }
.about-card { background: #f8f9fa; padding: 2rem; border-radius: 12px; text-align: center; }
.about-card h3 { color: #e94560; margin-bottom: 1rem; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 2rem; text-align: center; }
.stat h2 { font-size: 2.5rem; color: #e94560; }
.contact { padding: 4rem 0; }
.contact h1 { text-align: center; margin-bottom: 1rem; }
.contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; }
.contact-info, .contact-form { padding: 2rem; background: #f8f9fa; border-radius: 12px; }
.contact-info h3, .contact-form h3 { margin-bottom: 1.5rem; color: #e94560; }
.contact-form form { display: flex; flex-direction: column; gap: 1rem; }
.contact-form input { padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
.contact-form input:focus { outline: none; border-color: #e94560; }
.contact-form button { align-self: flex-start; cursor: pointer; border: none; font-size: 1rem; }
.site-footer { background: #1a1a2e; color: #fff; padding: 3rem 0 1rem; }
.site-footer .container { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 2rem; }
.footer-col h4 { margin-bottom: 1rem; color: #e94560; }
.footer-col p, .footer-col li { margin-bottom: 0.5rem; opacity: 0.8; }
.footer-col a { color: #fff; }
.footer-col a:hover { color: #e94560; }
.footer-bottom { text-align: center; padding-top: 2rem; margin-top: 2rem; border-top: 1px solid #333; opacity: 0.6; }
.login-page { min-height: 70vh; display: flex; align-items: center; justify-content: center; }
.login-box { background: #fff; padding: 3rem; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 400px; width: 100%; text-align: center; }
.login-box h1 { margin-bottom: 0.5rem; color: #1a1a2e; }
.login-box > p { color: #666; margin-bottom: 2rem; }
.login-box form { display: flex; flex-direction: column; gap: 1rem; }
.login-box input { padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
.login-box input:focus { outline: none; border-color: #e94560; }
.login-box button { margin-top: 0.5rem; }
.login-hint { margin-top: 1.5rem; font-size: 0.85rem; color: #999; }
.login-error { background: #fee; color: #c33; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; border: 1px solid #fcc; }
.back-link { display: inline-block; margin-top: 1rem; color: #e94560; font-size: 0.9rem; }
.admin-panel { padding: 2rem 0; }
.admin-header { text-align: center; margin-bottom: 3rem; }
.admin-header h1 { color: #1a1a2e; margin-bottom: 0.5rem; }
.admin-header p { color: #666; }
.admin-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.5rem; margin-bottom: 3rem; }
.stat-card { background: #f8f9fa; border-radius: 12px; padding: 1.5rem; text-align: center; border-top: 4px solid #e94560; }
.stat-card h3 { font-size: 0.85rem; color: #999; text-transform: uppercase; margin-bottom: 0.5rem; }
.stat-card p:first-of-type { font-size: 1.8rem; font-weight: 700; color: #1a1a2e; margin-bottom: 0.25rem; }
.stat-card p:last-child { font-size: 0.8rem; color: #888; }
.admin-section { margin-bottom: 3rem; }
.admin-section h2 { color: #1a1a2e; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e94560; }
.rule-card { background: #f8f9fa; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 0.75rem; border-left: 4px solid #e94560; }
.rule-card h3 { color: #e94560; margin-bottom: 0.5rem; }
.rule-card p { font-size: 0.85rem; color: #555; margin-bottom: 0.25rem; }
.lib-row, .config-row, .api-row, .test-row { display: flex; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid #eee; align-items: baseline; }
.lib-row p:first-child, .config-row p:first-child, .api-row p:first-child, .test-row p:first-child { font-weight: 600; color: #1a1a2e; min-width: 150px; }
.lib-row p:last-child, .config-row p:last-child { color: #666; flex: 1; }
.api-row p { min-width: 50px; }
.api-row p:first-child { color: #e94560; }
.api-row p:nth-child(2) { color: #1a1a2e; min-width: 120px; }
.api-row p:last-child { color: #888; flex: 1; }
.test-row p:first-child { min-width: 150px; }
.test-row p:last-child { color: #2e7d32; font-weight: 600; }
.product-row { display: flex; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid #eee; align-items: baseline; }
.product-row p:first-child { color: #999; min-width: 30px; }
.product-row p:nth-child(2) { font-weight: 600; min-width: 180px; }
.product-row p:nth-child(3) { color: #e94560; font-weight: 600; min-width: 100px; }
.product-row p:nth-child(4) { color: #666; min-width: 100px; }
.product-row p:last-child { color: #888; font-size: 0.85rem; }
@media (max-width: 768px) {
  .navbar { flex-direction: column; gap: 1rem; }
  .nav-links { flex-wrap: wrap; justify-content: center; gap: 1rem; }
  .contact-grid { grid-template-columns: 1fr; }
  .newsletter form { flex-direction: column; align-items: center; }
  .newsletter input { min-width: auto; width: 100%; max-width: 400px; }
  .dash-grid { grid-template-columns: 1fr; }
}
`;

// --- Placeholder image (1x1 PNG) ----------------------------------------------

const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// --- Session Store (generic) --------------------------------------------------

const sessions = new Map<string, Record<string, any>>();
const SESSION_COOKIE = "tw_session";

function generateSessionId(): string {
  // Cryptographically random session ids -- predictable ids are hijackable.
  // crypto.randomUUID() is available in Bun, Node 19+ and all browsers.
  return crypto.randomUUID().replace(/-/g, "");
}

function getSession(req: Request): Record<string, any> | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session) return null;
  if (Date.now() - (session._created || 0) > 3600000) {
    sessions.delete(match[1]);
    return null;
  }
  return session;
}

function createSession(data: Record<string, any>): string {
  const id = generateSessionId();
  // Prune expired sessions on write so a long-running dev server does not
  // accumulate entries for visitors who never came back.
  if (sessions.size > 100) {
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - (s._created || 0) > 3600000) sessions.delete(sid);
    }
  }
  sessions.set(id, { ...data, _created: Date.now() });
  return id;
}

function destroySession(req: Request): void {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (match) sessions.delete(match[1]);
}

// --- Middleware loader --------------------------------------------------------
// Reads middleware.twm and extracts route protection rules.
// Format: rule "name" { match "/path/**" auth true redirect "/login" }

interface MiddlewareRule {
  name: string;
  match: string;
  auth: boolean;
  redirect: string;
}

function loadMiddleware(rootDir: string): MiddlewareRule[] {
  const mwPath = join(rootDir, "middleware.twm");
  if (!existsSync(mwPath)) return [];
  const source = readFileSync(mwPath, "utf-8");
  const rules: MiddlewareRule[] = [];

  // Parse: rule "name" { match "/path" auth true redirect "/login" }
  const ruleRegex = /rule\s+"([^"]+)"\s*{([^}]+)}/g;
  let match;
  while ((match = ruleRegex.exec(source)) !== null) {
    const name = match[1];
    const body = match[2];
    const pathMatch = body.match(/match\s+"([^"]+)"/);
    const authMatch = body.match(/auth\s+(true|false)/);
    const redirectMatch = body.match(/redirect\s+"([^"]+)"/);
    if (pathMatch) {
      rules.push({
        name,
        match: pathMatch[1],
        auth: authMatch ? authMatch[1] === "true" : false,
        redirect: redirectMatch ? redirectMatch[1] : "/login",
      });
    }
  }
  return rules;
}

// Check if path matches a glob pattern like /admin/**
function matchGlob(path: string, pattern: string): boolean {
  if (pattern === "/**") return true;
  if (pattern === path) return true;
  // /admin/** matches /admin, /admin/anything
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(prefix + "/");
  }
  return false;
}

// --- 404 ----------------------------------------------------------------------

function get404(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 - Page Not Found</title><style>${DEFAULT_CSS}</style></head><body><div class="wrapper"><section class="hero"><div class="container"><h1>404</h1><p>Page not found</p><a class="btn" href="/">Go Home</a></div></section></div></body></html>`;
}

// --- Dev Command --------------------------------------------------------------

export async function devCommand(): Promise<void> {
  const args = process.argv.slice(3);
  let port: number | null = null;
  let host = "localhost";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) port = parseInt(args[i + 1], 10);
    else if (args[i] === "--host" && args[i + 1]) host = args[i + 1];
  }

  const rootDir = process.cwd();

  // Config port (tw.config.ts) -- CLI --port flag overrides
  if (port === null) {
    try {
      const cfgPath = join(rootDir, "tw.config.ts");
      if (existsSync(cfgPath)) {
        const { twImportTs: _twImportTs } = await import("@tw/shared/tw/node-import");
    const cfgMod: any = await _twImportTs(cfgPath);
        const cfg = cfgMod.default ?? cfgMod;
        const cfgPort = cfg?.dev?.port ?? cfg?.port;
        if (typeof cfgPort === "number") port = cfgPort;
      }
    } catch { /* ignore */ }
  }
  if (port === null) port = 3000;

  // Image optimization: compiler transform config + dev /_tw/img handler
  let devImageHandler: { handle(r: Request): Promise<Response | null> } | null = null;
  try {
    const cfgPath2 = join(rootDir, "tw.config.ts");
    let cfgImages: any = null;
    if (existsSync(cfgPath2)) {
      try {
        const { twImportTs: _twImportTs2 } = await import("@tw/shared/tw/node-import");
        const cfgMod2: any = await _twImportTs2(cfgPath2);
        const cfg2 = cfgMod2.default ?? cfgMod2;
        cfgImages = cfg2?.images ?? null;
      } catch { /* defaults */ }
    }
    const { setBuiltinImageConfig } = await import("../../../../packages/compiler/tw/index.ts").catch(() => import(findCompilerPath()) as any) as any;
    setBuiltinImageConfig?.(cfgImages);
    const { createImageHandler } = await import("../../../../packages/image/tw/index.ts");
    devImageHandler = createImageHandler({ rootDir, config: cfgImages ?? undefined });
  } catch { /* images off in dev */ }

  // .env support: load KEY=VALUE lines into process.env (without overwriting)
  const envPath = join(rootDir, ".env");
  if (existsSync(envPath)) {
    try {
      for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !(m[1] in process.env)) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
      console.log("    Env: .env loaded");
    } catch { /* ignore */ }
  }

  const homeDir = join(rootDir, "home");
  const publicDir = join(rootDir, "public");
  const stylePath = join(rootDir, "style.css");

  // Load CSS: documented convention is style/*.tss (see docs/project-tree.md)
  let css = DEFAULT_CSS;
  {
    const styleDir = join(rootDir, "style");
    const parts: string[] = [];
    if (existsSync(styleDir)) {
      for (const f of readdirSync(styleDir).filter(f => f.endsWith(".tss")).sort()) {
        try { parts.push(_compileTSS(readFileSync(join(styleDir, f), "utf-8"))); }
        catch (e: any) { console.log("    Warning: failed to compile " + f + ": " + e.message); }
      }
    }
    if (existsSync(stylePath)) parts.push(readFileSync(stylePath, "utf-8"));
    if (parts.length) css = parts.join("\n");
  }

  // Load middleware
  const middlewareRules = loadMiddleware(rootDir);

  // Scan and register components
  scanComponents(rootDir);
  const compDir = join(rootDir, "components");
  if (existsSync(compDir)) {
    const compFiles = readdirSync(compDir).filter(f => f.endsWith(".tw"));
    if (compFiles.length > 0) console.log("    Components: " + compFiles.map(f => f.replace(/\.tw$/, "")).join(", "));
  }


  // Scan routes
  function findRoutes(dir: string, prefix: string): string[] {
    const routes: string[] = [];
    if (!existsSync(dir)) return routes;
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        routes.push(...findRoutes(fullPath, prefix + "/" + entry));
      } else if (entry === "page.tw") {
        routes.push((prefix === "" ? "/" : prefix) + "  [page]");
      } else if (entry === "route.twm") {
        routes.push((prefix === "" ? "/" : prefix) + "  [api]");
      }
    }
    return routes;
  }

  const routes = findRoutes(homeDir, "");
  const components = existsSync(compDir) ? readdirSync(compDir).filter(f => f.endsWith(".tw")) : [];
  const libDir = join(rootDir, "lib");
  const libFiles = existsSync(libDir) ? readdirSync(libDir).filter(f => f.endsWith(".ts")) : [];
  const hasConfig = existsSync(join(rootDir, "tw.config.ts"));

  console.log("\n  \x1b[36mtw dev\x1b[0m -- starting development server\n");
  console.log("  Root:  " + rootDir);
  console.log("  Port:  http://" + host + ":" + port + "\n");
  console.log("  Project structure:");
  if (routes.length > 0) {
    console.log("    Pages & APIs:");
    for (const route of routes) console.log("      " + route);
  }
  if (components.length > 0) console.log("    Components: " + components.join(", "));
  if (libFiles.length > 0) console.log("    Lib: " + libFiles.join(", "));
  console.log("    Middleware: " + (middlewareRules.length > 0 ? middlewareRules.length + " rules" : "none"));
  console.log("    Config: " + (hasConfig ? "tw.config.ts" : "none"));
  console.log("");

  // --- Request handler ---------------------------------------------------------

  // --- Client-side npm modules (direct imports in .tw + client.ts) ----------
let devClientBundleSig = "";
let devClientBundleUrl = "";
async function ensureDevClientBundle(rootDir: string, pageSource: string, layoutFiles: string[]): Promise<string> {
  const { collectClientImportsFromSource, findServerOnlyViolations, buildClientChunk, buildPageScope } = await import("./client-bundle");
  const own = collectClientImportsFromSource(pageSource);
  const deps = new Set<string>(own);
  // Layout chain: imports load chunks for every page under it (inheritance).
  for (const lf of layoutFiles) {
    try {
      const ls = readFileSync(lf, "utf-8");
      for (const l of collectClientImportsFromSource(ls)) deps.add(l);
      for (const v of findServerOnlyViolations(ls)) console.error("  [tw] TW1007 (dev): " + lf + " \u2192 server-only import " + v);
    } catch { /* ignore */ }
  }
  for (const v of findServerOnlyViolations(pageSource)) console.error("  [tw] TW1007 (dev): server-only import " + v);
  let tags = "";
  for (const l of deps) {
    try {
      const u = buildClientChunk(rootDir, l, false);
      if (u) tags += '  <script src="/' + u + '"></script>\n';
    } catch { /* ignore */ }
  }
  if (own.length > 0) {
    try {
      const pu = buildPageScope(rootDir, own);
      if (pu) tags += '  <script src="/' + pu + '"></script>\n';
    } catch { /* ignore */ }
  }
  return tags;
}

// --- User middleware.twm execution (same semantics as `tw serve`) ----------
  // Literal path so esbuild bundles it for the Node CLI build. Fallback for
  // other layouts is handled by findCompilerPath-style resolution in serve.
  async function runUserMiddleware(req: Request): Promise<Response | Record<string, string> | null> {
    try {
      const mwPath = join(rootDir, "middleware.twm");
      if (!existsSync(mwPath)) return null;
      const { executeMiddleware, loadTWMModule, shouldMatchMiddleware } = await import("../../../../packages/server/tw/routing/twm-loader.ts");
      const mod = await loadTWMModule(mwPath, rootDir);
      const mwPathname = new URL(req.url).pathname;
      if (!mod.config?.matcher || shouldMatchMiddleware(mod.config.matcher, mwPathname)) {
        const mwResult: any = await executeMiddleware(mwPath, req, rootDir);
        if (mwResult instanceof Response) return mwResult;
        if (mwResult && typeof mwResult === "object" && mwResult.headers && !mwResult.status && !mwResult.json) {
          return mwResult.headers;
        }
      }
    } catch (e: any) {
      console.log("    Middleware error: " + e.message);
    }
    return null;
  }

  // Security headers for dev responses: @tw/security "dev" preset by default
  // (relaxed CSP-free set), overridable via tw.config.ts security.headers.
  let devSecurityHeaders: { apply(res: Response): Response } | null = null;
  try {
    const sec = await import("@tw/security");
    let devSecMode: string = "dev";
    try {
      const cfgFile = join(rootDir, "tw.config.ts");
      if (existsSync(cfgFile)) {
        const { twImportTs } = await import("@tw/shared/tw/node-import");
        const cfgMod: any = await twImportTs(cfgFile);
        devSecMode = (cfgMod.default ?? cfgMod)?.security?.headers ?? "dev";
      }
    } catch { /* default preset */ }
    const mode = devSecMode;
    if (mode === "off") devSecurityHeaders = null;
    else if (mode === "strict") devSecurityHeaders = sec.strictSecurityHeaders();
    else if (mode === "standard") devSecurityHeaders = sec.createSecurityHeaders();
    else devSecurityHeaders = sec.devSecurityHeaders();
  } catch { /* optional */ }

  // tw.config.ts redirects + headers in dev (both forms, like `tw serve`)
  let devRedirects: { from: string; to: string; status?: number }[] = [];
  let devCfgHeaders: { source: string; headers: Record<string, string> }[] = [];
  try {
    const cfgFile = join(rootDir, "tw.config.ts");
    if (existsSync(cfgFile)) {
      const { twImportTs } = await import("@tw/shared/tw/node-import");
      const cfgMod: any = await twImportTs(cfgFile);
      const cfg: any = cfgMod.default ?? cfgMod;
      if (cfg?.redirects) {
        devRedirects = Array.isArray(cfg.redirects)
          ? cfg.redirects
          : Object.entries(cfg.redirects).map(([from, to]: any) =>
              typeof to === "string" ? { from, to } : { from, ...to });
      }
      if (cfg?.headers) {
        devCfgHeaders = Array.isArray(cfg.headers)
          ? cfg.headers
          : Object.entries(cfg.headers).map(([source, headers]: any) => ({ source, headers }));
      }
    }
  } catch { /* config optional */ }
  const devPathMatch = (pattern: string, pathname: string): boolean =>
    pattern === pathname ||
    (pattern.endsWith("/**") && pathname.startsWith(pattern.slice(0, -2) + "/")) ||
    (pattern.endsWith("/") && pathname.startsWith(pattern)) ||
    (pattern === "/**" && pathname.startsWith("/"));

  async function devFetchInner(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const path = url.pathname;
      const time = new Date().toISOString().split("T")[1].split(".")[0];

      // Pick up component changes without a restart
      rescanComponentsIfNeeded(rootDir);

      console.log("  [" + time + "] " + req.method + " " + path);

      // -- 1. Middleware: auth check ------------------------------------------
      const session = getSession(req);
      for (const rule of middlewareRules) {
        if (rule.auth && matchGlob(path, rule.match)) {
          if (!session || !(session as any).userId) {
            console.log("    -> 302 Redirect to " + rule.redirect + " (auth required)");
            return new Response(null, {
              status: 302,
              headers: { Location: rule.redirect },
            });
          }
        }
      }

      // -- 1b. Hydration runtime for interactive pages -------------------------
      if (path === "/__tw_runtime.js") {
        // Source run: apps/cli/tw/commands -> repo root is 4 ups.
        // Bundled CLI (Node): dist -> root is 3 ups.
        const _fu = import.meta.url.replace("file://", "");
        const _srcDir = _fu.substring(0, _fu.lastIndexOf("/"));
        const _bd = (globalThis as any).__TW_BUNDLE_DIR;
        // Bundled (npm) CLI ships the runtime next to tw.mjs as
        // dist/hydration-runtime.js (same resolution as build.ts).
        // Source run keeps the repo-relative path.
        const runtimeCandidates = _bd
          ? [resolve(_bd, "hydration-runtime.js"), resolve(_srcDir, "../../../..", "packages/runtime/tw/client/hydration-runtime.js")]
          : [resolve(_srcDir, "../../../..", "packages/runtime/tw/client/hydration-runtime.js")];
        for (const runtimePath of runtimeCandidates) {
          if (existsSync(runtimePath)) {
            return new Response(readFileSync(runtimePath, "utf-8"), {
              headers: { "Content-Type": "application/javascript; charset=utf-8" },
            });
          }
        }
        return new Response("// runtime not found", { status: 404 });
      }

      // -- 1c. Client-side npm modules bundle ----------------------------------
      if (/^\/js\/(c|p|tw-client)-[a-z0-9]+\.js$/.test(path)) {
        const clientBundlePath = join(rootDir, ".tw", path.slice(1));
        if (existsSync(clientBundlePath)) {
          return new Response(readFileSync(clientBundlePath, "utf-8"), {
            headers: { "Content-Type": "application/javascript; charset=utf-8" },
          });
        }
        return new Response("// no client modules", { status: 404 });
      }

      // -- 2. Static: CSS -----------------------------------------------------
      // route stylesheets captured per request (see injectDevCss): served
      // as content-hashed, immutable-cacheable asset files.
      if (path.startsWith("/assets/")) {
        const name = path.slice("/assets/".length);
        const css = DEV_CSS_FILES.get(name);
        if (css) {
          return new Response(css, { headers: { "Content-Type": "text/css", "Cache-Control": "public, max-age=31536000, immutable" } });
        }
      }
      if (path === "/style.css") {
        return new Response(css, { headers: { "Content-Type": "text/css" } });
      }

      // -- 3/4. Static: public/ directory first, then the image placeholder --
      // Real files in public/ (including every .png) win over the placeholder;
      // the 1x1 placeholder is only a fallback for missing images.
      if (existsSync(publicDir)) {
        const publicFile = join(publicDir, path);
        const pubFile = Bun.file(publicFile);
        if (await pubFile.exists()) return new Response(pubFile);
      }

      if (path === "/placeholder.png" || path.endsWith(".png")) {
        return new Response(PLACEHOLDER_PNG, { headers: { "Content-Type": "image/png" } });
      }

      // -- 5. Route resolution ------------------------------------------------
      const routePath = path === "/" ? "" : path;

      // -- 5a. API route (.twm): /api -> home/api/route.twm (with [param] dirs)
      const resolvedTwm = resolveHomeFile(homeDir, path, ["route.twm"]);
      const twmFile = resolvedTwm ? resolvedTwm.file : join(homeDir, routePath, "route.twm");
      if (resolvedTwm) {
        try {
          // Parse request body for POST/PUT
          let requestBody: any = {};
          if (req.method === "POST" || req.method === "PUT") {
            const contentType = req.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              try { requestBody = await req.json(); } catch {}
            } else {
              try {
                const formData = await req.formData();
                requestBody = Object.fromEntries(formData);
              } catch {}
            }
          }

          const request = {
            method: req.method,
            url: url.href,
            path,
            params: resolvedTwm.params,
            query: Object.fromEntries(url.searchParams),
            headers: Object.fromEntries(req.headers),
            body: requestBody,
            session: session || {},
            ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1",
          };

          // Execute through the shared @tw/server loader — the same path as
          // `tw serve`: both DSL (`fn get`) and JS (`export function get`,
          // uppercase verbs) forms, async handlers awaited, errors contained.
          const { executeRouteHandler } = await import("@tw/server");
          const result = await executeRouteHandler(twmFile, req.method, request, rootDir);
          const jsonBody = JSON.stringify(result.json);

          // Check if TWM wants to set cookies or redirect
          const responseHeaders: Record<string, string> = {
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          };

          // TWM can return: { status, json, session, redirect, cookie }
          if (result.json._session) {
            const sid = createSession(result.json._session);
            responseHeaders["Set-Cookie"] = `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; Max-Age=3600`;
            delete result.json._session;
          }
          if (result.json._destroySession) {
            destroySession(req);
            responseHeaders["Set-Cookie"] = `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`;
            delete result.json._destroySession;
          }
          if (result.json._redirect) {
            console.log("    -> " + result.status + " Redirect to " + result.json._redirect);
            return new Response(null, {
              status: 302,
              headers: {
                Location: result.json._redirect,
                ...(responseHeaders["Set-Cookie"] ? { "Set-Cookie": responseHeaders["Set-Cookie"] } : {}),
              },
            });
          }

          // TWM can return _render to re-render a page with data (SSR pattern)
          // Like Rails render :new or Django render(request, template, context)
          if (result.json._render) {
            const renderPath = result.json._render;
            const errorMessage = result.json._errorMessage || "";
            delete result.json._render;
            delete result.json._errorMessage;

            const pageRoutePath = renderPath === "/" ? "" : renderPath;
            const pageFile = join(homeDir, pageRoutePath, "page.tw");
            if (existsSync(pageFile)) {
              try {
                const pageSource = readFileSync(pageFile, "utf-8");
                const pageResult = compileSync(pageSource, { filePath: pageFile });
                let pageHtml = pageResult.html;
                pageHtml = pageHtml.replace("</head>", "<style>" + css + "</style>\n</head>");

                // Inject error message into the rendered page
                if (errorMessage) {
                  pageHtml = pageHtml.replace(
                    '<div class="login-box">',
                    '<div class="login-box"><div class="login-error">' + errorMessage + '</div>'
                  );
                }

                console.log("    -> " + result.status + " Rendered " + renderPath + " (" + pageHtml.length + " bytes)");
                const renderHeaders: Record<string, string> = {
                  "Content-Type": "text/html; charset=utf-8",
                };
                if (responseHeaders["Set-Cookie"]) {
                  renderHeaders["Set-Cookie"] = responseHeaders["Set-Cookie"];
                }
                return new Response(pageHtml, { status: result.status, headers: renderHeaders });
              } catch (e: any) {
                console.log("    -> 500 Render Error: " + e.message);
              }
            }
          }

          // html / text bodies bypass the JSON path (and its session/redirect
          // helpers) and are served with their own content type.
          if (result.html !== undefined) {
            console.log("    -> " + result.status + " (" + result.html.length + " bytes HTML)");
            return new Response(result.html, {
              status: result.status,
              headers: { "Content-Type": "text/html; charset=utf-8", ...(result.headers ?? {}) },
            });
          }
          if (result.text !== undefined) {
            console.log("    -> " + result.status + " (" + result.text.length + " bytes text)");
            return new Response(result.text, {
              status: result.status,
              headers: { "Content-Type": "text/plain; charset=utf-8", ...(result.headers ?? {}) },
            });
          }

          console.log("    -> " + result.status + " (" + jsonBody.length + " bytes JSON)");
          return new Response(jsonBody, { status: result.status, headers: responseHeaders });
        } catch (e: any) {
          console.log("    -> 500 API Error: " + e.message);
          return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }      // -- 5b. Page route (.tw): /about -> home/about/page.tw (with [param] dirs)
      const resolved = resolveHomeFile(homeDir, path, ["page.tw", "index.tw"]);
      if (resolved) {
        const twFile = resolved.file;
        try {
          const source = readFileSync(twFile, "utf-8");
          // capture this route's stylesheet chunks (tss/css imports + scoped <style>)
          if (typeof beginCssRouteCapture === "function") beginCssRouteCapture(path);
          const result = compileSync(source, { filePath: twFile, stateVars: resolved.params });
          let html = result.html;

          // Apply the FULL layout chain (root first, then section layouts)
          const pageDir = twFile.substring(0, twFile.lastIndexOf("/"));
          const chain: string[] = [];
          {
            let cur = pageDir;
            const homeAbs = resolve(homeDir);
            for (let i = 0; i < 16; i++) {
              const cand = join(cur, "layout.tw");
              if (existsSync(cand)) chain.push(cand);
              if (resolve(cur) === homeAbs) break;
              const parent = resolve(cur, "..");
              if (parent === resolve(cur) || !parent.startsWith(homeAbs)) break;
              cur = parent;
            }
            chain.reverse();
          }
          if (chain.length > 0 && generateWithLayoutChain) {
            const layoutPrograms = chain.map(lp => compileSync(readFileSync(lp, "utf-8"), { filePath: lp }).ast).filter(Boolean);
            if (layoutPrograms.length > 0) {
              html = generateWithLayoutChain(layoutPrograms, result.ast, resolved.params);
              const pageTitle = result.html.match(/<title>([^<]*)<\/title>/);
              if (pageTitle && pageTitle[1] && pageTitle[1] !== "TW Page") {
                html = html.replace(/<title>[^<]*<\/title>/, `<title>${pageTitle[1]}</title>`);
              }
            }
          }

          // end capture; link the route's stylesheet as a hashed /assets/ file
          if (typeof endCssRouteCapture === "function") endCssRouteCapture();
          html = injectDevCss(html, path);

          // Client runtime on every page (SPA); state seed for interactive pages
          if (/data-tw-event|data-tw-i/.test(html)) {
            const seed: Record<string, any> = { ...((result as any).stateSeed ?? {}) };
            for (const [k, v] of Object.entries(resolved.params || {})) seed[k] = v;
            const seedScript = `<script id="__tw_state" type="application/json">${JSON.stringify(seed).replace(/</g, "\\u003c")}</script>`;
            html = html.replace("</body>", "  " + seedScript + "\n</body>");
          }
          let devClientTag = "";
          try {
            const _clockSrc = existsSync(resolved.file) ? readFileSync(resolved.file, "utf-8") : "";
            devClientTag = await ensureDevClientBundle(rootDir, _clockSrc, chain);
          } catch { /* ignore */ }
          if (/<\/body>/.test(html)) {
            html = html.replace("</body>", devClientTag + "  <script src=\"/__tw_runtime.js\"></script>\n</body>");
          }

          // Per-route head.tw (SEO meta/OG tags)
          const headTw = join(dirname(resolved.file), "head.tw");
          if (existsSync(headTw)) {
            try {
              const headRes: any = compileSync(readFileSync(headTw, "utf-8"), { filePath: headTw });
              const headBody = headRes.html.match(/<body>([\s\S]*)<\/body>/);
              if (headBody && headBody[1].trim()) {
                html = html.replace("</head>", "  " + headBody[1].trim() + "\n</head>");
              }
            } catch (e: any) { console.log("    Warning: head.tw failed: " + e.message); }
          }

          html = html.replace("</head>", "<style>" + css + "</style>\n</head>");

          const errors = result.diagnostics.filter((d: any) => d.severity === "error");
          console.log("    -> 200 OK (" + html.length + " bytes, " + errors.length + " errors)");

          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } catch (e: any) {
          console.log("    -> 500 Error: " + e.message);
          return new Response("<!DOCTYPE html><html><body><h1>500 - Compile Error</h1><pre>" + e.message + "</pre></body></html>",
            { status: 500, headers: { "Content-Type": "text/html" } });
        }
      }

      // -- 6. 404 (custom home/not-found.tw if present) ----------------------
      console.log("    -> 404 Not Found");
      const nfFile = join(homeDir, "not-found.tw");
      if (existsSync(nfFile)) {
        try {
          const nfSource = readFileSync(nfFile, "utf-8");
          const nfResult = compileSync(nfSource, { filePath: nfFile });
          let nfHtml = nfResult.html;
          const layoutPath = findLayoutDev(homeDir, homeDir);
          if (layoutPath) {
            const layoutSource = readFileSync(layoutPath, "utf-8");
            const layoutResult = compileSync(layoutSource, { filePath: layoutPath });
            if (layoutResult.ast && generateWithLayout) nfHtml = generateWithLayout(layoutResult.ast, nfResult.ast);
          }
          nfHtml = nfHtml.replace("</head>", "<style>" + css + "</style>\n</head>");
          return new Response(nfHtml, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
        } catch { /* fall through */ }
      }
      return new Response(get404(), {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
  }

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req: Request): Promise<Response> {
      // tw.config.ts redirects first (same precedence as `tw serve`)
      const reqUrl = new URL(req.url);
      for (const r of devRedirects) {
        if (!r?.from || !r?.to) continue;
        if (devPathMatch(r.from, reqUrl.pathname)) {
          const status = [301, 302, 307, 308].includes(r.status as number) ? r.status : 301;
          let loc = r.to.startsWith("http") ? r.to : new URL(r.to, req.url).toString();
          // Preserve the query string unless the target has its own.
          if (reqUrl.search && !loc.includes("?")) loc += reqUrl.search;
          return new Response(null, { status, headers: { Location: loc } });
        }
      }
      // Real middleware.twm: Response -> intercept; { headers } -> merge
      const mwHeaders = await runUserMiddleware(req);
      if (mwHeaders instanceof Response) return mwHeaders;
      // /_tw/img/* — optimized image variants
      const u = new URL(req.url);
      if (u.pathname === "/_tw/img" || u.pathname.startsWith("/_tw/img/")) {
        const imgRes = await devImageHandler?.handle(req);
        if (imgRes) return imgRes;
      }
      const response = await devFetchInner(req);
      if (mwHeaders && typeof mwHeaders === "object") {
        for (const key of Object.keys(mwHeaders)) {
          try { if (!response.headers.has(key)) response.headers.set(key, mwHeaders[key]); } catch { /* skip */ }
        }
      }
      const u2 = new URL(req.url);
      for (const h of devCfgHeaders) {
        if (h?.source && h?.headers && devPathMatch(h.source, u2.pathname)) {
          for (const key of Object.keys(h.headers)) {
            // single-line values only (strip CR/LF)
            try { if (!response.headers.has(key)) response.headers.set(key, String(h.headers[key]).replace(/[\r\n]/g, "")); } catch { /* skip */ }
          }
        }
      }
      if (devSecurityHeaders) {
        try { return devSecurityHeaders.apply(response); } catch { /* keep response */ }
      }
      return response;
    },
  });

  console.log("  Server running! Open http://" + host + ":" + port + " in your browser.");
  console.log("  Press Ctrl+C to stop.\n");
}
