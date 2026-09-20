/**
 * TW Framework -- testing helpers (in-process route & page testing).
 *
 * Usage in tests/*.test.ts (run via `tw test`, which uses bun:test):
 *
 *   import { test, expect } from "bun:test";
 *   import { testRoute, testPage } from "@tw/server/tw/testing";
 *
 *   test("GET /api/products returns paginated list", async () => {
 *     const res = await testRoute(process.cwd(), "GET", "/api/products");
 *     expect(res.status).toBe(200);
 *     expect(res.json.items.length).toBe(20);
 *   });
 *
 * No server process needed -- handlers run in-process.
 */

import { join, dirname } from "node:path";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";

// --- Route file resolution (mirrors the dev walker, minimal) ------------------

function resolveRouteFile(rootDir: string, pathname: string): { file: string; params: Record<string, string> } | null {
  const homeDir = join(rootDir, "home");
  if (!existsSync(homeDir)) return null;
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const isDir = (p) => { try { return existsSync(p) && statSync(p).isDirectory(); } catch { return false; } };

  function walk(dir, i, params) {
    if (i >= segments.length) {
      const f = join(dir, "route.twm");
      return existsSync(f) ? { file: f, params } : null;
    }
    const seg = segments[i];
    const exact = join(dir, seg);
    if (isDir(exact)) { const r = walk(exact, i + 1, params); if (r) return r; }
    for (const entry of readdirSync(dir)) {
      if (/^\(.*\)$/.test(entry) && isDir(join(dir, entry))) {
        const r = walk(join(dir, entry), i, params); if (r) return r;
      }
      const m = /^\[([^\].]+)\]$/.exec(entry);
      if (m && isDir(join(dir, entry))) {
        const r = walk(join(dir, entry), i + 1, { ...params, [m[1]]: seg }); if (r) return r;
      }
      const c = /^\[\.\.\.(.+)\]$/.exec(entry) || /^\[\[\.\.\.(.+)\]\]$/.exec(entry);
      if (c && isDir(join(dir, entry))) {
        const f = join(dir, entry, "route.twm");
        if (existsSync(f)) return { file: f, params: { ...params, [c[1]]: segments.slice(i).join("/") } };
      }
    }
    return null;
  }
  return walk(homeDir, 0, {});
}

// --- testRoute: run an API route handler in-process ---------------------------

export async function testRoute(
  rootDir: string,
  method: string,
  pathname: string,
  init: { body?: any; headers?: Record<string, string>; query?: Record<string, string> } = {},
): Promise<{ status: number; json: any; headers?: Record<string, string> }> {
  const { executeRouteHandler } = await import("../routing/twm-loader.ts");
  const resolved = resolveRouteFile(rootDir, pathname);
  if (!resolved) {
    return { status: 404, json: { ok: false, error: "route not found: " + pathname } };
  }
  const queryStr = new URLSearchParams(init.query ?? {}).toString();
  const url = "http://test.local" + pathname + (queryStr ? "?" + queryStr : "");
  const headers = new Headers(init.headers ?? {});
  let body: any = init.body;
  if (body !== undefined && typeof body === "object") {
    body = JSON.stringify(body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const request: any = new Request(url, { method: method.toUpperCase(), headers, body });
  request.params = resolved.params;
  return executeRouteHandler(resolved.file, method.toUpperCase(), request, rootDir);
}

// --- testPage: render a page (with layout chain) in-process -------------------

export async function testPage(
  rootDir: string,
  pathname: string,
): Promise<{ status: number; html: string }> {
  const homeDir = join(rootDir, "home");
  const segments = pathname.split("/").filter(Boolean);
  const isDir = (p) => { try { return existsSync(p) && statSync(p).isDirectory(); } catch { return false; } };

  function walk(dir, i, params) {
    if (i >= segments.length) {
      const f = join(dir, "page.tw");
      return existsSync(f) ? { file: f, params } : null;
    }
    const seg = segments[i];
    const exact = join(dir, seg);
    if (isDir(exact)) { const r = walk(exact, i + 1, params); if (r) return r; }
    for (const entry of readdirSync(dir)) {
      if (/^\(.*\)$/.test(entry) && isDir(join(dir, entry))) {
        const r = walk(join(dir, entry), i, params); if (r) return r;
      }
      const m = /^\[([^\].]+)\]$/.exec(entry);
      if (m && isDir(join(dir, entry))) {
        const r = walk(join(dir, entry), i + 1, { ...params, [m[1]]: seg }); if (r) return r;
      }
      const c = /^\[\.\.\.(.+)\]$/.exec(entry);
      if (c && isDir(join(dir, entry))) {
        const f = join(dir, entry, "page.tw");
        if (existsSync(f)) return { file: f, params: { ...params, [c[1]]: segments.slice(i).join("/") } };
      }
    }
    return null;
  }
  const resolved = walk(homeDir, 0, {});
  if (!resolved) return { status: 404, html: "" };

  // Locate the compiler via the repo's standard search path
  const { compileSync, generateWithLayoutChain, registerComponentTemplate, clearComponentRegistry } = await findCompiler();
  clearComponentRegistry();
  const compDir = join(rootDir, "components");
  if (existsSync(compDir)) {
    for (const f of readdirSync(compDir).filter(f => f.endsWith(".tw"))) {
      const fp = join(compDir, f);
      const r = compileSync(readFileSync(fp, "utf-8"), { filePath: fp, transforms: false, diagnostics: false });
      if (r.ast) registerComponentTemplate(f.replace(/\.tw$/, ""), r.ast);
    }
  }

  const result = compileSync(readFileSync(resolved.file, "utf-8"), { filePath: resolved.file, stateVars: resolved.params } as any);
  let html = result.html;
  const pageProgram = result.ast;

  // Layout chain
  const layouts: string[] = [];
  let d = dirname(resolved.file);
  while (true) {
    const lp = join(d, "layout.tw");
    if (existsSync(lp) && d.startsWith(homeDir)) layouts.unshift(lp);
    if (d === homeDir || !d.startsWith(homeDir)) break;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  if (layouts.length > 0) {
    const progs = layouts.map(lp => compileSync(readFileSync(lp, "utf-8"), { filePath: lp }).ast).filter(Boolean);
    if (progs.length > 0 && generateWithLayoutChain) {
      html = generateWithLayoutChain(progs, pageProgram, resolved.params);
    }
  }
  const css = result.css;
  if (css) html = html.replace("</head>", "<style>" + css + "</style>\n</head>");
  return { status: 200, html };
}

async function findCompiler(): Promise<any> {
  const candidates = [
    join(rootDirGlobal, "node_modules/tw-framework/packages/compiler/tw/index.ts"),
    join(rootDirGlobal, "packages/compiler/tw/index.ts"),
    process.env.TW_COMPILER_PATH ?? "",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return import(c);
  // Fallback: resolve relative to this module (monorepo dev). import.meta.dir
  // is Bun-only; a compiled CJS bundle of this file uses __dirname instead.
  const selfDir: string = (import.meta as any).dir
    ?? (typeof __dirname !== "undefined" ? __dirname : "");
  return import(join(selfDir, "../../../compiler/tw/index.ts"));
}

const rootDirGlobal = process.cwd();
