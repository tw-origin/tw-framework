/**
 * Phase D -- the server-only boundary: the transitive client-graph walk and
 * its four layers.
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkClientGraph, formatChain, collectModuleImports } from "../apps/cli/tw/commands/server-boundary";
import { parseWithDetails, collectServerBlocks, stripServerBlockRegions } from "@tw/compiler";

function app(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tw-bnd-"));
  for (const [rel, src] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, src);
  }
  return dir;
}
const strip = (s: string) => {
  const prog = parseWithDetails(s, { filePath: "<s>", cache: false, experimental: { serverBlocks: true } } as any).program;
  const blocks = collectServerBlocks(prog);
  return blocks.length ? stripServerBlockRegions(s, blocks) : s;
};
const walk = (dir: string, entries: string[], opts: any = {}) =>
  walkClientGraph(entries.map((e) => join(dir, e)), { stripServerRegions: strip, rootDir: dir, ...opts });

describe("Phase D: boundary walk", () => {
  test("collectModuleImports handles import / export-from / dynamic", () => {
    const specs = collectModuleImports('import a from "./x"\nexport * from "./y"\nconst z = await import("./z")\n').map((i) => i.specifier);
    expect(specs).toEqual(["./x", "./y", "./z"]);
  });

  test("relative .server.ts is a violation, with the chain", () => {
    const dir = app({
      "home/page.tw": 'import Cart from "./islands/Cart.tsx"\ndiv { }\n',
      "home/islands/Cart.tsx": 'import { db } from "../lib/db.server.ts"\nexport default () => db\n',
      "home/lib/db.server.ts": "export const db = 1\n",
    });
    const v = walk(dir, ["home/page.tw"]);
    expect(v.length).toBe(1);
    expect(v[0].layer).toBe("name");
    expect(formatChain(v[0])).toContain("page.tw");
    expect(formatChain(v[0])).toContain("Cart.tsx");
    expect(formatChain(v[0])).toContain("db.server.ts");
  });

  test("re-export chain is caught", () => {
    const dir = app({
      "home/page.tw": 'import { a } from "./a.ts"\n',
      "home/a.ts": 'export * from "./b.ts"\n',
      "home/b.ts": 'import x from "./c.server.ts"\nexport const a = x\n',
      "home/c.server.ts": "export default 1\n",
    });
    expect(walk(dir, ["home/page.tw"]).length).toBe(1);
  });

  test("L1: node built-ins", () => {
    const dir = app({ "home/page.tw": 'import fs from "node:fs"\n' });
    const v = walk(dir, ["home/page.tw"]);
    expect(v[0].layer).toBe("L1");
    const dir2 = app({ "home/page.tw": 'import { readFileSync } from "fs"\n' });
    expect(walk(dir2, ["home/page.tw"])[0].layer).toBe("L1");
  });

  test("L2: default package denylist", () => {
    const dir = app({ "home/page.tw": 'import { Pool } from "pg"\n' });
    expect(walk(dir, ["home/page.tw"])[0].layer).toBe("L2");
  });

  test("L3: config onlyPackages, incl. scope/* prefix", () => {
    const dir = app({ "home/page.tw": 'import a from "mylib"\nimport b from "@acme/db"\n' });
    const v = walk(dir, ["home/page.tw"], { onlyPackages: ["mylib", "@acme/*"] });
    expect(v.map((x) => x.layer)).toEqual(["L3", "L3"]);
  });

  test("L4: the @tw/server-only marker", () => {
    const dir = app({
      "home/page.tw": 'import { x } from "./secret.ts"\n',
      "home/secret.ts": 'import "@tw/server-only"\nexport const x = 1\n',
    });
    expect(walk(dir, ["home/page.tw"])[0].layer).toBe("L4");
  });

  test("single-line import and export-from are caught", () => {
    const dir = app({ "home/page.tw": 'import {x} from "./y.server.ts"\n' });
    expect(walk(dir, ["home/page.tw"]).length).toBe(1);
  });

  test("cycles do not hang", () => {
    const dir = app({
      "home/page.tw": 'import { a } from "./a.ts"\n',
      "home/a.ts": 'import { b } from "./b.ts"\nexport const a = b\n',
      "home/b.ts": 'import { a } from "./a.ts"\nexport const b = 1\n',
    });
    expect(walk(dir, ["home/page.tw"]).length).toBe(0);
  });

  test("a server block importing pg is OK (server graph, not client)", () => {
    const dir = app({
      "home/page.tw": 'server {\n  import { Pool } from "pg"\n  const p = new Pool()\n}\np "x"\n',
    });
    expect(walk(dir, ["home/page.tw"]).length).toBe(0);
  });

  test("a clean page passes", () => {
    const dir = app({ "home/page.tw": 'import dayjs from "dayjs"\nh1 "hi"\n' });
    expect(walk(dir, ["home/page.tw"]).length).toBe(0);
  });
});
