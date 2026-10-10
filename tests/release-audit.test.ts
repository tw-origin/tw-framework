/**
 * Guards for the pre-release audit fixes.
 *
 * Each of these covers something that was a silent placeholder: an exported
 * helper that returned the wrong thing, an incremental tokenizer that dropped
 * tokens, and a rule engine that shipped enabled rules which could never fire.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tokenize } from "../packages/compiler/tw/lexer/tokenizer/index.ts";
import { tokenizeIncremental } from "../packages/compiler/tw/lexer/clustering.ts";
import { parse } from "../packages/compiler/tw/parser/index.ts";
import { generateStaticHTML, generateHTML } from "../packages/compiler/tw/codegen/index.ts";
import { BUILTIN_RULES, createDefaultRulesEngine } from "../packages/compiler/tw/diagnostics/rules-engine.ts";
import { ERROR_CODES } from "../packages/compiler/tw/diagnostics/codes.ts";

const toks = (src: string) => tokenize(src, { filePath: "a.tw" }).tokens.filter((t) => t.type !== "EOF");
const values = (ts: Array<{ value: string }>) => ts.map((t) => t.value);
const placed = (ts: Array<{ pos: { line: number; col: number }; value: string }>) =>
  ts.map((t) => `${t.pos.line}:${t.pos.col}:${t.value}`);

describe("incremental tokenize", () => {
  test("an insertion keeps the region's tokens and the tail", () => {
    const oldSrc = `div { h1 "Hi" }`;
    const newSrc = `div { h1 "Hi" span "Yo" }`;
    const at = oldSrc.indexOf(" }"); // pure insertion, start === end
    const out = tokenizeIncremental(oldSrc, toks(oldSrc), newSrc, at, at);
    expect(values(out)).toEqual(values(toks(newSrc)));
  });

  test("a replacement that shrinks the source shifts the tail back", () => {
    const oldSrc = `div { h1 "Hello" }`;
    const newSrc = `div { h1 "Hi" }`;
    const start = oldSrc.indexOf('"Hello"');
    const out = tokenizeIncremental(oldSrc, toks(oldSrc), newSrc, start, start + 7);
    const full = toks(newSrc);
    expect(values(out)).toEqual(values(full));
    expect(out[out.length - 1].pos.offset).toBe(full[full.length - 1].pos.offset);
  });

  test("line and column are recomputed against the new source", () => {
    const oldSrc = `div {\n  h1 "Hi"\n}`;
    const newSrc = `div {\n  p "added"\n  h1 "Hi"\n}`;
    const at = oldSrc.indexOf("h1"); // insert before h1
    const out = tokenizeIncremental(oldSrc, toks(oldSrc), newSrc, at, at);
    expect(placed(out)).toEqual(placed(toks(newSrc)));
  });

  test("a multi-line edit produces the same tokens as a full tokenize", () => {
    const oldSrc = `page { title "T" }\ndiv {\n  h1 "Hi"\n}\n`;
    const newSrc = `page { title "T" }\ndiv {\n  p "one"\n  p "two"\n  h1 "Hi"\n}\n`;
    const at = oldSrc.indexOf("h1");
    const out = tokenizeIncremental(oldSrc, toks(oldSrc), newSrc, at, at);
    expect(placed(out)).toEqual(placed(toks(newSrc)));
  });
});

describe("generateStaticHTML", () => {
  const src = `page { title "T" render static }\ndiv {\n  h1 "Hello"\n}\n`;

  test("returns an HTML document, not a template-function source", () => {
    const out = generateStaticHTML(parse(src, { filePath: "x.tw" }));
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain("<h1>Hello</h1>");
    expect(out).not.toContain("function render(");
  });

  test("a page with no interactivity ships no script tag", () => {
    expect(/<script/i.test(generateStaticHTML(parse(src, { filePath: "x.tw" })))).toBe(false);
  });

  test("agrees with generateHTML for the same program", () => {
    const ast = parse(src, { filePath: "x.tw" });
    expect(generateStaticHTML(ast)).toBe(generateHTML(ast));
  });
});

describe("built-in rule engine", () => {
  test("no enabled rule is a no-op", () => {
    const dead = BUILTIN_RULES.filter((r) => r.enabled && !checkCanEmit(r)).map((r) => r.id);
    expect(dead).toEqual([]);
  });

  test("the default engine only runs rules that can emit", () => {
    const engine = createDefaultRulesEngine();
    const enabled = engine.getEnabledRules();
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every((r) => checkCanEmit(r))).toBe(true);
  });
});

/**
 * A rule can emit iff its body can produce a message: either it pushes one, or
 * it returns a non-empty array literal. This inspects the compiled function, so
 * it does not depend on feeding the rule the right kind of node.
 */
function checkCanEmit(rule: { check: (...args: any[]) => any[] }): boolean {
  const src = rule.check.toString();
  return /\.push\(/.test(src) || /return \s*\[[^\]]/.test(src);
}

describe("no placeholder exports", () => {
  test("no exported function has an empty body", () => {
    // `packages/runtime/tw/testing/test-utils.ts` shipped 106 `mockXxx(): void {}`
    // stubs that silently did nothing. A function that promises to mock
    // something and does nothing is worse than a missing one, so keep the
    // class out. Names whose emptiness IS the point (noop) are allowed.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(import.meta.dir, ".."))) {
      const text = readFileSync(file, "utf-8");
      const lines = text.split("\n");
      for (const m of text.matchAll(/^\s*export function (\w+)\(.*\):\s*void\s*\{\s*(?:void [\w.]+;\s*)*\}\s*$/gm)) {
        const name = m[1];
        if (/noop/i.test(name)) continue;
        // A no-op can be the point, as long as the doc above says so.
        const lineNo = text.slice(0, m.index).split("\n").length - 1;
        const doc = lines.slice(Math.max(0, lineNo - 12), lineNo).join(" ");
        if (/no-op|noop marker/i.test(doc)) continue;
        offenders.push(`${file.replace(import.meta.dir, "")}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("error-code catalogue", () => {
  const declared = ERROR_CODES as Record<string, { reserved?: boolean }>;

  test("every TWnnn literal in the source is declared in ERROR_CODES", () => {
    const undeclared = new Set<string>();
    for (const file of sourceFiles(join(import.meta.dir, ".."))) {
      for (const m of readFileSync(file, "utf-8").matchAll(/["'](TW\d{3})["']/g)) {
        if (!(m[1] in declared)) undeclared.add(m[1]);
      }
    }
    expect([...undeclared]).toEqual([]);
  });

  test("a code marked reserved is never emitted", () => {
    // Its own declaration (the catalogue and the type union) is not an emission.
    const skip = ["diagnostics/codes.ts", "diagnostics/types.ts"];
    const reserved = Object.keys(declared).filter((c) => declared[c].reserved);
    expect(reserved.length).toBeGreaterThan(0);
    const leaked: string[] = [];
    for (const file of sourceFiles(join(import.meta.dir, ".."))) {
      if (skip.some((s) => file.replace(/\\/g, "/").endsWith(s))) continue;
      const text = readFileSync(file, "utf-8");
      for (const c of reserved) {
        if (text.includes(`"${c}"`) || text.includes(`'${c}'`)) leaked.push(`${c} in ${file}`);
      }
    }
    expect(leaked).toEqual([]);
  });
});

describe("string case helpers", () => {
  test("camelCase is lower camel, not Pascal", async () => {
    const { camelCase } = await import("../packages/shared/tw/utils/string/transform.ts");
    // The pattern used to also upper-case the first character, so this
    // returned "HelloWorldFooBar" -- a PascalCase value from a camelCase name.
    expect(camelCase("hello-world_foo bar")).toBe("helloWorldFooBar");
    expect(camelCase("user profile-id")).toBe("userProfileId");
    expect(camelCase("a")).toBe("a");
  });

  test("pascalCase still capitalises the first letter", async () => {
    const { pascalCase } = await import("../packages/shared/tw/utils/string/transform.ts");
    expect(pascalCase("hello-world_foo bar")).toBe("HelloWorldFooBar");
    expect(pascalCase("user profile-id")).toBe("UserProfileId");
  });

  test("the case helpers produce the documented output", async () => {
    const shared = await import("../packages/shared/tw/utils/string/transform.ts");
    const cases: Array<[string, string, string]> = [
      ["camelCase", "hello-world_foo bar", "helloWorldFooBar"],
      ["pascalCase", "hello-world_foo bar", "HelloWorldFooBar"],
      ["kebabCase", "HelloWorld foo_bar", "hello-world-foo-bar"],
      ["snakeCase", "HelloWorld foo-bar", "hello_world_foo_bar"],
      ["constantCase", "helloWorld foo", "HELLO_WORLD_FOO"],
      ["titleCase", "hello-world_foo bar", "Hello World Foo Bar"],
      ["dotCase", "hello-world_foo bar", "hello.world.foo.bar"],
      ["slugify", "hello-world_foo bar", "hello-world-foo-bar"],
    ];
    for (const [fn, input, want] of cases) {
      expect(`${fn}(${input})`).toBeDefined();
      expect((shared as any)[fn](input)).toBe(want);
    }
  });

  test("the compiler re-exports the shared case helpers, not a second copy", async () => {
    const shared = await import("../packages/shared/tw/utils/string/transform.ts");
    const compiler = await import("../packages/compiler/tw/utils/string/case.ts");
    for (const fn of ["camelCase", "pascalCase", "kebabCase", "snakeCase", "constantCase", "titleCase", "dotCase"] as const) {
      expect((compiler as any)[fn]).toBe((shared as any)[fn]);
    }
  });
});

describe("duplicate exports", () => {
  test("the duplicate inventory has not grown", () => {
    // The legacy grab-bag utility modules ship many of the same helper in two
    // or three places. That is recorded debt, not something to add to: new code
    // belongs in one module, and a burn-down lowers this number.
    const count = duplicatedExportNames().length;
    expect(count).toBeLessThanOrEqual(RECORDED_DUPLICATES);
  });
});

/** How many exported names appear in 2+ non-barrel modules when recorded. */
const RECORDED_DUPLICATES = 512;

/** Exported names declared in more than one non-barrel source file. */
function duplicatedExportNames(): string[] {
  const decl = /^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;
  const where = new Map<string, Set<string>>();
  for (const file of sourceFiles(join(import.meta.dir, ".."))) {
    if (file.endsWith("index.ts")) continue;
    for (const m of readFileSync(file, "utf-8").matchAll(decl)) {
      if (!where.has(m[1])) where.set(m[1], new Set());
      where.get(m[1])!.add(file);
    }
  }
  return [...where.entries()].filter(([, fs]) => fs.size > 1).map(([n]) => n);
}

/** Every .ts/.tsx under packages/ and apps/cli (skipping build output). */
function sourceFiles(root: string): string[] {
  const skip = new Set(["node_modules", ".git", ".tw", "dist", "coverage"]);
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (skip.has(e)) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".ts") || e.endsWith(".tsx")) out.push(p);
    }
  };
  for (const top of ["packages", "apps/cli"]) walk(join(root, top));
  return out;
}
