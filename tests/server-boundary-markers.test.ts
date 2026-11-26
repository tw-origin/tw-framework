import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { walkClientGraph, formatChain, SERVER_ONLY_MARKER, CLIENT_SAFE_MARKER } from "../apps/cli/tw/commands/server-boundary.ts";
import { parseWithDetails, collectServerBlocks, stripServerBlockRegions } from "../packages/compiler/tw/index.ts";

// The module boundary: `lib/` is server-only, `@tw/client-safe` opts one module
// out, `@tw/server-only` marks a module anywhere. These tests pin the rules so a
// later change to the walker cannot quietly widen or narrow them.

/** Same stripping `tw build` uses, so the tests exercise the real path. */
function strip(src: string): string {
  const prog = (parseWithDetails as any)(src, { filePath: "<scan>", cache: false, experimental: { serverBlocks: true } }).program;
  const blocks = (collectServerBlocks as any)(prog);
  return blocks.length ? (stripServerBlockRegions as any)(src, blocks) : src;
}

let root = "";

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tw-boundary-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function check(dir: string, entry: string) {
  return walkClientGraph([join(dir, entry)], { rootDir: dir, stripServerRegions: strip });
}

const PAGE = (body: string) => `page { title "T" render static }\n${body}\n`;

describe("module boundary markers", () => {
  test("a lib/ module is server-only by default", () => {
    const dir = project({
      "lib/db.js": `export function query() { return 1 }\n`,
      "home/page.tw": PAGE(`import { query } from "../lib/db"\ndiv { p { "{query()}" } }`),
    });
    const v = check(dir, "home/page.tw");
    expect(v.length).toBe(1);
    expect(v[0].layer).toBe("lib");
    expect(formatChain(v[0])).toContain("lib/db");
    rmSync(dir, { recursive: true, force: true });
  });

  test(`${CLIENT_SAFE_MARKER} opts a lib/ module out`, () => {
    const dir = project({
      "lib/dates.js": `import "${CLIENT_SAFE_MARKER}";\nexport function formatDate() { return "1" }\n`,
      "home/page.tw": PAGE(`import { formatDate } from "../lib/dates"\ndiv { p { "{formatDate()}" } }`),
    });
    expect(check(dir, "home/page.tw").length).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test(`${SERVER_ONLY_MARKER} marks a module outside lib/`, () => {
    const dir = project({
      "services/payment.js": `import "${SERVER_ONLY_MARKER}";\nexport function charge() { return 1 }\n`,
      "home/page.tw": PAGE(`import { charge } from "../services/payment"\ndiv { p { "{charge()}" } }`),
    });
    const v = check(dir, "home/page.tw");
    expect(v.length).toBe(1);
    expect(v[0].layer).toBe("L4");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a client-safe module may not pull in a lib/ dependency (transitive)", () => {
    const dir = project({
      "lib/db.js": `export function query() { return 1 }\n`,
      "lib/leaky.js": `import "${CLIENT_SAFE_MARKER}";\nimport { query } from "./db"\nexport function leaky() { return query() }\n`,
      "home/page.tw": PAGE(`import { leaky } from "../lib/leaky"\ndiv { p { "{leaky()}" } }`),
    });
    const v = check(dir, "home/page.tw");
    expect(v.length).toBe(1);
    expect(v[0].layer).toBe("lib");
    expect(formatChain(v[0])).toContain("lib/leaky");
    expect(formatChain(v[0])).toContain("./db");
    rmSync(dir, { recursive: true, force: true });
  });

  test("the chain survives two client-safe hops (nested)", () => {
    const dir = project({
      "lib/db.js": `export function query() { return 1 }\n`,
      "lib/leaky.js": `import "${CLIENT_SAFE_MARKER}";\nimport { query } from "./db"\nexport function leaky() { return query() }\n`,
      "lib/nested.js": `import "${CLIENT_SAFE_MARKER}";\nimport { leaky } from "./leaky"\nexport function nested() { return leaky() }\n`,
      "home/page.tw": PAGE(`import { nested } from "../lib/nested"\ndiv { p { "{nested()}" } }`),
    });
    const v = check(dir, "home/page.tw");
    expect(v.length).toBe(1);
    const chain = formatChain(v[0]);
    expect(chain).toContain("lib/nested");
    expect(chain).toContain("lib/leaky");
    expect(chain).toContain("./db");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a side-effect import of lib/ is still a violation", () => {
    const dir = project({
      "lib/setup.js": `export const x = 1\n`,
      "home/page.tw": PAGE(`import "../lib/setup"\ndiv { p "hi" }`),
    });
    const v = check(dir, "home/page.tw");
    expect(v.length).toBe(1);
    expect(v[0].layer).toBe("lib");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a page with no server-only imports is clean", () => {
    const dir = project({
      "home/page.tw": PAGE(`div { p "nothing imported" }`),
    });
    expect(check(dir, "home/page.tw").length).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
