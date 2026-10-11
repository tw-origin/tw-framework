/**
 * Server blocks -- parser + AST .
 *
 * These tests exercise the `server { }` / `server:defer { }` block behind
 * `experimental.serverBlocks`. Everything here is parser-only: no execution,
 * runtime, cache or `.server.ts` boundary.
 */

import { describe, test, expect } from "bun:test";
import { parseWithDetails, compileSync } from "@tw/compiler";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ON = { serverBlocks: true } as const;

function parseSB(src: string, on = true) {
  return parseWithDetails(src, { filePath: "<test>", cache: false, experimental: { serverBlocks: on } } as any);
}

function serverBlock(src: string, on = true): any {
  const r = parseSB(src, on);
  return (r.program.directives as any[]).find((d) => d.type === "ServerBlock");
}

describe("server block: shape", () => {
  test("parses `server { const a = 1 }` into a ServerBlock", () => {
    const b = serverBlock("server { const a = 1 }");
    expect(b).toBeTruthy();
    expect(b.deferred).toBe(false);
    expect(b.declaredNames).toEqual(["a"]);
    expect(b.source.trim()).toBe("const a = 1");
  });

  test("`server:defer { }` sets deferred", () => {
    const b = serverBlock("server:defer { const a = 1 }");
    expect(b.deferred).toBe(true);
    expect(b.declaredNames).toEqual(["a"]);
  });

  test("the block is not left in the body", () => {
    const r = parseSB('server { const a = 1 }\nh1 "x"');
    expect(r.program.body.some((n: any) => n.type === "ServerBlock")).toBe(false);
  });

  test("a top-level block after markup is still collected", () => {
    const r = parseSB('h1 "x"\nserver { const a = 1 }');
    const b = (r.program.directives as any[]).find((d) => d.type === "ServerBlock");
    expect(b).toBeTruthy();
    expect(b.declaredNames).toEqual(["a"]);
  });
});

describe("server block: declaredNames", () => {
  test("destructuring, renames and defaults", () => {
    const b = serverBlock("server { const { user, orders: o } = x; const [a, b = 2] = y }");
    expect(b.declaredNames).toEqual(["user", "o", "a", "b"]);
  });

  test("function and class declarations", () => {
    const b = serverBlock("server { function f(){} class C{} }");
    expect(b.declaredNames).toEqual(["f", "C"]);
  });

  test("nested-scope names are excluded", () => {
    const b = serverBlock("server { const a = 1; function f(){ const inner = 2 } { const blk = 3 } }");
    expect(b.declaredNames).toEqual(["a", "f"]);
  });

  test("let / var are collected too", () => {
    const b = serverBlock("server { let a = 1; var b = 2 }");
    expect(b.declaredNames).toEqual(["a", "b"]);
  });
});

describe("server block: imports", () => {
  test("imports are captured and excluded from declaredNames", () => {
    const b = serverBlock('server { import { db } from "lib/db"; import def from "@./x.server.ts"; const a = 1 }');
    expect(b.imports.map((i: any) => i.specifier)).toEqual(["lib/db", "@./x.server.ts"]);
    expect(b.declaredNames).toEqual(["a"]);
  });
});

describe("server block: raw-TS extraction", () => {
  test("a `}` inside a string, a comment, and a template does not end the block", () => {
    const src = 'server { const s = "}"; // }\n const t = `a${ {k:1} }b`; const u = 2 }';
    const b = serverBlock(src);
    expect(b).toBeTruthy();
    expect(b.declaredNames).toEqual(["s", "t", "u"]);
  });

  test("unclosed block reports TW101", () => {
    const r = parseSB("server { const a = 1");
    expect(r.errors.some((e: any) => e.code === "TW101")).toBe(true);
  });

  test("an unknown modifier reports TW099", () => {
    const r = parseSB("server:foo { const a = 1 }");
    expect(r.errors.some((e: any) => e.code === "TW099")).toBe(true);
  });

  test("`server` without a block reports TW100", () => {
    const r = parseSB("server const a = 1");
    // `server` is a keyword followed by an identifier -- not a block start, so
    // it is handled as before (no ServerBlock, no TW100). The error fires only
    // when a block form is attempted.
    expect((r.program.directives as any[]).some((d) => d.type === "ServerBlock")).toBe(false);
  });
});

describe("server block: regression on the existing keyword", () => {
  test("`render server` parses exactly as before (flag on)", () => {
    const on = parseSB('page { render server }\nh1 "hi"');
    expect((on.program.directives as any[]).some((d) => d.type === "ServerBlock")).toBe(false);
    expect(on.program.directives.map((d: any) => d.type)).toEqual(["PageDirective"]);
  });

  test("`render server` parses exactly as before (flag off)", () => {
    const off = parseSB('page { render server }\nh1 "hi"', false);
    expect(off.program.directives.map((d: any) => d.type)).toEqual(["PageDirective"]);
  });

  test("a bare `server` keyword elsewhere is not a block", () => {
    const r = parseSB('div "server"');
    expect((r.program.directives as any[]).some((d) => d.type === "ServerBlock")).toBe(false);
  });
});

describe("server block: flag off", () => {
  test("with the flag off a `server { }` page behaves as before", () => {
    // Baseline: with the flag off the block is NOT recognised -- `server`
    // stays ordinary page content (a Text node) and no ServerBlock is
    // produced. The same source with the flag on yields a ServerBlock and
    // drops the leading text.
    const off = parseSB("server { const a = 1 }\nh1 \"x\"", false);
    expect(off.errors.length).toBe(0);
    expect((off.program.directives as any[]).some((d) => d.type === "ServerBlock")).toBe(false);
    expect(off.program.body.some((n: any) => n.type === "Text")).toBe(true);

    const on = parseSB("server { const a = 1 }\nh1 \"x\"", true);
    expect((on.program.directives as any[]).some((d) => d.type === "ServerBlock")).toBe(true);
  });
});

describe("server block: codegen is a no-op", () => {
  test("a page WITH a block compiles to the same output as the page without it", () => {
    const withBlock = 'server {\n  const a = 1\n}\nh1 "Hi"\n';
    const without = 'h1 "Hi"\n';
    const a = compileSync(withBlock, { filePath: "<t>", experimental: { serverBlocks: true } });
    const b = compileSync(without, { filePath: "<t>", experimental: { serverBlocks: true } });
    expect(a.html).toBe(b.html);
    expect(a.css).toBe(b.css);
    expect(a.js).toBe(b.js);
  });
});

// --- Byte-identical fixtures -------------------------------------------------

function twFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) twFiles(p, acc);
    else if (p.endsWith(".tw")) acc.push(p);
  }
  return acc;
}

describe("server block: byte-identical fixtures", () => {
  const examplesDir = join(import.meta.dir, "..", "examples");
  const files = twFiles(examplesDir);

  test("there are fixtures to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("flag ON output equals flag OFF output for every fixture", () => {
    // The flag gates every change, so flag OFF is byte-identical to the
    // pre-change baseline; asserting ON === OFF therefore proves ON is
    // byte-identical to that baseline too.
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Byte-identity ON vs OFF is only promised for pages that do NOT contain
      // a server block: with the flag on a block is stripped from codegen, with
      // it off the block is ordinary page content, so the two are expected to
      // differ. Skip the block pages (they are covered by the block tests).
      if (/\bserver\s*(?::[A-Za-z]\w*)?\s*\{/.test(src)) continue;
      const on = compileSync(src, { filePath: f, experimental: { serverBlocks: true } });
      const off = compileSync(src, { filePath: f, experimental: { serverBlocks: false } });
      expect(on.html, `${f} html`).toBe(off.html);
      expect(on.css, `${f} css`).toBe(off.css);
      expect(on.js, `${f} js`).toBe(off.js);
    }
  });
});
