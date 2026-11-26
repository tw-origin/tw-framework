import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  serverImportCollisions, RESERVED_BLOCK_BINDINGS, resolveServerImports,
} from "../packages/compiler/tw/server-blocks/index.ts";
import { walkClientGraph, formatChain } from "../apps/cli/tw/commands/server-boundary.ts";
import { parseWithDetails, collectServerBlocks, stripServerBlockRegions } from "../packages/compiler/tw/index.ts";

// A4: a server-only import used ONLY inside `server { }` must be allowed; used
// in markup it must be TW1007. Two things had to be true for that to work, and
// both are pinned here: page-level imports must reach the block, and an import
// whose local name is a block built-in must be reported instead of silently
// overwritten.

function strip(src: string): string {
  const prog = (parseWithDetails as any)(src, { filePath: "<scan>", cache: false, experimental: { serverBlocks: true } }).program;
  const blocks = (collectServerBlocks as any)(prog);
  return blocks.length ? (stripServerBlockRegions as any)(src, blocks) : src;
}

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tw-a4-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const PAGE = (body: string) => `page { title "T" render static }\n${body}\n`;

describe("built-in binding collisions (TW125)", () => {
  test("every reserved built-in is covered", () => {
    expect([...RESERVED_BLOCK_BINDINGS].sort()).toEqual([
      "cookies", "env", "fetch", "getSession", "headers",
      "notFound", "params", "query", "redirect", "requireUser",
    ]);
  });

  test("a named import that shadows a built-in is reported", () => {
    const c = serverImportCollisions(`import { query } from "../lib/db"\n`);
    expect(c.length).toBe(1);
    expect(c[0].name).toBe("query");
    expect(c[0].specifier).toBe("../lib/db");
  });

  test("an aliased import is valid because the local name differs", () => {
    expect(serverImportCollisions(`import { query as dbQuery } from "../lib/db"\n`)).toEqual([]);
  });

  test("a default and a namespace import are checked by their local names", () => {
    expect(serverImportCollisions(`import params from "../lib/x"\n`).map((c) => c.name)).toEqual(["params"]);
    expect(serverImportCollisions(`import * as headers from "../lib/x"\n`).map((c) => c.name)).toEqual(["headers"]);
  });

  test("a side-effect import binds nothing and is ignored", () => {
    expect(serverImportCollisions(`import "../lib/query"\n`)).toEqual([]);
  });

  test("a safe name is not reported", () => {
    expect(serverImportCollisions(`import { dbQuery } from "../lib/db"\n`)).toEqual([]);
  });
});

describe("A4: server-only imports", () => {
  test("used only inside a server block is allowed", () => {
    const dir = project({
      "lib/db.js": `export function dbQuery() { return 1 }\n`,
      "home/page.tw": PAGE(`import { dbQuery } from "../lib/db"\nserver { const rows = dbQuery() }\ndiv { p "ok" }`),
    });
    expect(walkClientGraph([join(dir, "home/page.tw")], { rootDir: dir, stripServerRegions: strip })).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("used in markup is TW1007", () => {
    const dir = project({
      "lib/db.js": `export function dbQuery() { return 1 }\n`,
      "home/page.tw": PAGE(`import { dbQuery } from "../lib/db"\ndiv { p { "{dbQuery()}" } }`),
    });
    const v = walkClientGraph([join(dir, "home/page.tw")], { rootDir: dir, stripServerRegions: strip });
    expect(v.length).toBe(1);
    expect(v[0].layer).toBe("lib");
    rmSync(dir, { recursive: true, force: true });
  });

  test("used in both places is TW1007", () => {
    const dir = project({
      "lib/db.js": `export function dbQuery() { return 1 }\n`,
      "home/page.tw": PAGE(`import { dbQuery } from "../lib/db"\nserver { const r = dbQuery() }\ndiv { p { "{dbQuery()}" } }`),
    });
    expect(walkClientGraph([join(dir, "home/page.tw")], { rootDir: dir, stripServerRegions: strip }).length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("module-internal markers", () => {
  test("a module importing @tw/server-only still loads", async () => {
    const dir = project({
      "lib/so.js": `import "@tw/server-only";\nexport function dbQuery() { return "SO" }\n`,
      "home/page.tw": PAGE(""),
    });
    const out = await resolveServerImports(
      { imports: [{ source: `import { dbQuery } from "../lib/so"`, specifier: "../lib/so" }] } as any,
      join(dir, "home/page.tw"),
    );
    expect((out.dbQuery as any)()).toBe("SO");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a module importing @tw/client-safe still loads", async () => {
    const dir = project({
      "lib/cs.js": `import "@tw/client-safe";\nexport function fmt() { return "CS" }\n`,
      "home/page.tw": PAGE(""),
    });
    const out = await resolveServerImports(
      { imports: [{ source: `import { fmt } from "../lib/cs"`, specifier: "../lib/cs" }] } as any,
      join(dir, "home/page.tw"),
    );
    expect((out.fmt as any)()).toBe("CS");
    rmSync(dir, { recursive: true, force: true });
  });

  test("other imports in the module keep working", async () => {
    const dir = project({
      "lib/dep.js": `export const dep = "DEP";\n`,
      "lib/m.js": `import "@tw/server-only";\nimport { dep } from "./dep";\nexport function value() { return dep }\n`,
      "home/page.tw": PAGE(""),
    });
    const out = await resolveServerImports(
      { imports: [{ source: `import { value } from "../lib/m"`, specifier: "../lib/m" }] } as any,
      join(dir, "home/page.tw"),
    );
    expect((out.value as any)()).toBe("DEP");
    rmSync(dir, { recursive: true, force: true });
  });
});
