/**
 * Directive parsing, engine detection, and cache growth.
 *
 * Both parsers used to regex the WHOLE file, so a string or a comment anywhere
 * could decide a component's directive or its engine. Two fixes, each taken from
 * how the problem is solved elsewhere:
 *
 *   - the hydration directive is now read only from the file's leading comments
 *     and directive prologue, the way `"use client"` is read -- the prologue, not
 *     the file
 *   - the engine is read from the imports after comments are stripped, keeping
 *     strings (the specifier IS a string, so it has to survive)
 *
 * The third fix is housekeeping: the intermediate module directory grew by one
 * file per edit, so a build now clears it first.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { directiveRegion, parseClientStrategy, detectEngine, pruneIslandCache } from "../apps/cli/tw/commands/island-bundle.ts";

describe("directiveRegion: only the top of the file", () => {
  test("leading line comments are in", () => {
    expect(directiveRegion(`// @client:visible\nimport x from "y";`)).toContain("@client:visible");
  });

  test("leading block comments are in", () => {
    expect(directiveRegion(`/* @client:lazy */\nimport x from "y";`)).toContain("@client:lazy");
  });

  test("a string prologue is in, like \"use client\"", () => {
    expect(directiveRegion(`"@client:visible";\nimport x from "y";`)).toContain("@client:visible");
  });

  test("comments AFTER real code are out", () => {
    const src = `import x from "y";\n// @client:visible\nexport default function C() {}`;
    expect(directiveRegion(src)).not.toContain("@client:visible");
  });

  test("a JSX string in the body is out", () => {
    const src = `export default function C() { return <div>@client:visible</div>; }`;
    expect(directiveRegion(src)).not.toContain("@client:visible");
  });

  test("a trailing comment on the first code line is out", () => {
    const src = `export default function C() {} // @client:visible`;
    expect(directiveRegion(src)).not.toContain("@client:visible");
  });
});

describe("parseClientStrategy: no false positives from the body", () => {
  test("a body mention does NOT make it visible", () => {
    const src = `import { useState } from "react";\nexport default function C() { return <div>{"@client:visible"}</div>; }`;
    expect(parseClientStrategy(src).strategy).toBe("eager");
  });

  test("a real leading directive still works", () => {
    expect(parseClientStrategy(`// @client:visible\nimport { useState } from "react";`).strategy).toBe("visible");
  });

  test("a body @server mention does NOT ship it as server-only", () => {
    const src = `import { useState } from "react";\nconst note = "@server";\nexport default function C() { return <div>{note}</div>; }`;
    expect(parseClientStrategy(src).kind).toBe("client");
  });

  test("a real leading @server still ships no JavaScript", () => {
    expect(parseClientStrategy(`// @server\nexport default function C() {}`).kind).toBe("server");
  });
});

describe("detectEngine: comments do not decide the engine", () => {
  test("a comment mentioning react does not make it a React component", () => {
    const src = `// this is not a react component\nimport { h } from "preact";\nexport default function C() {}`;
    expect(detectEngine(src, "react")).toBe("preact");
  });

  test("the specifier survives: a real react import is detected", () => {
    expect(detectEngine(`import { useState } from "react";`, "preact")).toBe("react");
  });

  test("a string containing react does not decide it, but the import does", () => {
    const src = `const label = "react is great";\nimport { h } from "preact";\nexport default function C() {}`;
    expect(detectEngine(src, "react")).toBe("preact");
  });

  test("a // inside a string is not a comment", () => {
    const src = `const url = "https://x/react";\nimport { h } from "preact";`;
    expect(detectEngine(src, "react")).toBe("preact");
  });

  test("still falls back when there is no framework import", () => {
    expect(detectEngine(`export default function C() {}`, "preact")).toBe("preact");
  });
});

describe("pruneIslandCache: bounded intermediates", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tw-prune-"));
    mkdirSync(join(root, ".tw", ".island-ssr"), { recursive: true });
    mkdirSync(join(root, ".tw", ".island"), { recursive: true });
    mkdirSync(join(root, ".tw", "js"), { recursive: true });
    for (let i = 0; i < 5; i++) writeFileSync(join(root, ".tw", ".island-ssr", `ssr-${i}.mjs`), "x");
    for (let i = 0; i < 3; i++) writeFileSync(join(root, ".tw", ".island", `out-${i}.js`), "x");
    writeFileSync(join(root, ".tw", "js", "island-abc.js"), "// the real asset");
  });

  afterAll(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  test("it removes the intermediate files", () => {
    expect(pruneIslandCache(root)).toBe(8);
    expect(readdirSync(join(root, ".tw", ".island-ssr")).length).toBe(0);
    expect(readdirSync(join(root, ".tw", ".island")).length).toBe(0);
  });

  test("it leaves the real, content-hashed assets alone", () => {
    expect(existsSync(join(root, ".tw", "js", "island-abc.js"))).toBe(true);
  });

  test("running it again is harmless", () => {
    expect(pruneIslandCache(root)).toBe(0);
  });

  test("a missing directory is not an error", () => {
    expect(pruneIslandCache(join(root, "nope"))).toBe(0);
  });
});
