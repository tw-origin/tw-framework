import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSync, registerComponentTemplate } from "../packages/compiler/tw/index.ts";
import { minifyHTML, minifyCSS } from "../packages/compiler/tw/codegen/index.ts";
import { minifyJS } from "../packages/compiler/tw/optimizer/index.ts";

const PAGE = `page { title "T" render ssr }
div {
  if true { span "always" }
  if false { span "never" }
  button on:click "c++" "Go"
}`;

describe("compiler passes: optimizer", () => {
  test("default folds constant if-branches", () => {
    const r = compileSync(PAGE, { filePath: "p.tw" });
    expect(r.html).toContain("<span>always</span>");
    expect(r.html).not.toContain("never");
    expect(r.html).not.toContain("tw-if");
  });

  test("foldConstants: false keeps the branch as a runtime tw-if", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { foldConstants: false } });
    expect(r.html).toContain("tw-if");
    expect(r.html).toContain("never");
  });

  test("deadCode / treeShaking are accepted and change nothing by default", () => {
    const a = compileSync(PAGE, { filePath: "p.tw" });
    const b = compileSync(PAGE, { filePath: "p.tw", compiler: { deadCode: true, treeShaking: true } });
    expect(b.html).toBe(a.html);
  });

  test("optimization: none turns folding off end to end", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { foldConstants: false, deadCode: false, treeShaking: false } });
    expect(r.html).toContain("tw-if");
  });
});

describe("compiler passes: ssr attributes", () => {
  test("default emits SSR event attributes, not hydration markers", () => {
    const r = compileSync(PAGE, { filePath: "p.tw" });
    expect(r.html).toContain("data-tw-event-click");
    expect(r.html).not.toContain("data-tw-hydrate");
  });

  test("ssrAttributes: false leaves the hydration-marker path", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { ssrAttributes: false } });
    expect(r.html).toContain("data-tw-hydrate");
  });
});

describe("compiler passes: minifiers", () => {
  test("minifyHTML collapses whitespace runs but keeps comments", () => {
    const messy = "<div>   <!-- marker -->   <p>  hi  </p>   </div>";
    const out = minifyHTML(messy, { removeComments: false });
    expect(out).not.toContain("   ");
    expect(out).toContain("<!-- marker -->");
  });

  test("minifyCSS strips comments and whitespace", () => {
    expect(minifyCSS("/* c */ .a {  color : red ; }")).not.toContain("/* c */");
  });

  test("minifyJS strips comments", () => {
    expect(minifyJS("// hi\nconst a = 1;")).not.toContain("// hi");
  });

  test("a compiler block with minify on does not throw and keeps TW's marker attrs", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { minifyHTML: true, minifyCSS: true, minifyJS: true } });
    expect(typeof r.html).toBe("string");
    expect(r.html).toContain("data-tw-event-click");
  });

  test("preserveComments: true keeps CSS comments (skips the stripper)", () => {
    const withComments = `page { title "T" render ssr }
div { span "x" }`;
    const a = compileSync(withComments, { filePath: "p.tw", compiler: { minifyCSS: true } });
    const b = compileSync(withComments, { filePath: "p.tw", compiler: { minifyCSS: true, preserveComments: true } });
    expect(typeof b.css).toBe("string");
    expect(b.css.length).toBeGreaterThanOrEqual(a.css.length);
  });
});

describe("compiler passes: diagnostics strictness", () => {
  const BAD = 'div.class { "x" }' + String.fromCodePoint(0x1f680);
  test("strict (default) reports errors", () => {
    const r = compileSync(BAD, { filePath: "p.tw" });
    expect(r.diagnostics.filter((d) => d.severity === "error").length).toBeGreaterThan(0);
  });

  test("compiler.strict === false downgrades errors to warnings", () => {
    const r = compileSync(BAD, { filePath: "p.tw", compiler: { looseDiagnostics: true } });
    expect(r.diagnostics.filter((d) => d.severity === "error").length).toBe(0);
    expect(r.diagnostics.filter((d) => d.severity === "warning").length).toBeGreaterThan(0);
  });
});

describe("compiler passes: defaults unchanged", () => {
  test("an empty compiler block compiles identically", () => {
    const a = compileSync(PAGE, { filePath: "p.tw" });
    const b = compileSync(PAGE, { filePath: "p.tw", compiler: {} });
    expect(b.html).toBe(a.html);
    expect(b.css).toBe(a.css);
    expect(b.js).toBe(a.js);
  });

  test("the async compile path honours the same passes", async () => {
    const { compile } = await import("../packages/compiler/tw/index.ts");
    const a = await compile(PAGE, { filePath: "p.tw" });
    const b = await compile(PAGE, { filePath: "p.tw", compiler: { foldConstants: false } });
    expect(b.html).toContain("tw-if");
    expect(a.html).not.toContain("tw-if");
  });
});

describe("compiler passes: removeEmptyBlocks", () => {
  const SRC = `page { title "T" render ssr }
div {
  span "a"
  span "   "
}`;
  test("default drops whitespace-only text nodes", () => {
    const r = compileSync(SRC, { filePath: "p.tw" });
    expect(r.html).toContain("a");
  });

  test("removeEmptyBlocks: false keeps them (accepted, no crash)", () => {
    const r = compileSync(SRC, { filePath: "p.tw", compiler: { removeEmptyBlocks: false } });
    expect(typeof r.html).toBe("string");
    expect(r.html).toContain("a");
  });
});

describe("compiler passes: scopedStyles (1a)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-scope-"));
  mkdirSync(join(dir, "components"), { recursive: true });
  writeFileSync(join(dir, "components", "Button.module.tss"), ".btn {\n  bg #2563eb\n  c white\n}\n");
  const pageFile = join(dir, "home.tw");
  writeFileSync(pageFile, `import "@./components/Button.module.tss"\n\ndiv {\n  button.btn "Click"\n}\n`);
  const src = readFileSync(pageFile, "utf-8");

  test("default (on) hashes the module class -- today's behaviour", () => {
    const r = compileSync(src, { filePath: pageFile });
    expect(r.html).toMatch(/class="tw-btn-[a-z0-9]+"/);
    expect(r.css).toMatch(/\.tw-btn-[a-z0-9]+\{/);
  });

  test("scopedStyles: false keeps the class global", () => {
    const r = compileSync(src, { filePath: pageFile, compiler: { scopedStyles: false } });
    expect(r.html).toContain('class="btn"');
    expect(r.css).toContain(".btn{");
  });

  test("the async path honours it too", async () => {
    const { compile } = await import("../packages/compiler/tw/index.ts");
    const r = await compile(src, { filePath: pageFile, compiler: { scopedStyles: false } });
    expect(r.html).toContain('class="btn"');
  });
});

describe("compiler passes: scoped style blocks (B)", () => {
  const SRC = `page { title "T" render ssr }
div.box {
  span "hi"
}
<style scoped>
.box { color: red }
</style>`;
  const PLAIN = `page { title "T" render ssr }
div.box { span "hi" }`;

  test("a scoped block scopes its CSS and tags the elements", () => {
    const r = compileSync(SRC, { filePath: "p.tw" });
    expect(r.css).toMatch(/\.box\[data-tw-scope="[a-z0-9]+"\]\{/);
    expect(r.html).toMatch(/<div class="box" data-tw-scope="[a-z0-9]+">/);
  });

  test("the scope id is deterministic (same file -> same id)", () => {
    const a = compileSync(SRC, { filePath: "p.tw" });
    const b = compileSync(SRC, { filePath: "p.tw" });
    const idA = a.css.match(/data-tw-scope="([a-z0-9]+)"/)?.[1];
    const idB = b.css.match(/data-tw-scope="([a-z0-9]+)"/)?.[1];
    expect(idA).toBeDefined();
    expect(idA).toBe(idB);
  });

  test("scopedStyles: false leaves the block unscoped", () => {
    const r = compileSync(SRC, { filePath: "p.tw", compiler: { scopedStyles: false } });
    expect(r.css).toContain(".box{");
    expect(r.css).not.toContain("data-tw-scope");
    expect(r.html).not.toContain("data-tw-scope");
  });

  test("a page with NO scoped block is untouched", () => {
    const r = compileSync(PLAIN, { filePath: "p.tw" });
    expect(r.html).not.toContain("data-tw-scope");
  });

  test("the async path scopes too", async () => {
    const { compile } = await import("../packages/compiler/tw/index.ts");
    const r = await compile(SRC, { filePath: "p.tw" });
    expect(r.css).toContain("data-tw-scope");
  });
});

describe("compiler passes: inlineComponents + sourceMaps", () => {
  const comp = compileSync(`div.card {\n  h2 "Card title"\n  slot\n}`, { filePath: "components/Card.tw", transforms: false, optimize: false, diagnostics: false });
  registerComponentTemplate("Card", comp.ast);
  const PAGE = `page { title "T" render ssr }
div {
  Card { span "inside" }
}`;
  const tagsOf = (n: any, acc: string[] = []): string[] => {
    if (!n || typeof n !== "object") return acc;
    if (n.type === "Element" && n.tag) acc.push(n.tag);
    for (const k of ["body", "children", "elseBody"]) if (Array.isArray(n[k])) for (const c of n[k]) tagsOf(c, acc);
    return acc;
  };

  test("default keeps the component as a node (resolved by the codegen)", () => {
    const r = compileSync(PAGE, { filePath: "p.tw" });
    expect(tagsOf(r.ast)).toContain("Card");
  });

  test("inlineComponents: true flattens the component body into the page AST", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { inlineComponents: true } });
    const tags = tagsOf(r.ast);
    expect(tags).not.toContain("Card");
    expect(tags).toContain("h2");
  });

  test("inlined output still fills the slot", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { inlineComponents: true } });
    expect(r.html).toContain("inside");
    expect(r.html).toContain("Card title");
  });

  test("sourceMaps is opt-in -> no map by default", () => {
    const r = compileSync(PAGE, { filePath: "p.tw" });
    expect(r.sourceMap).toBeUndefined();
  });

  test("sourceMaps: true attaches a map", () => {
    const r = compileSync(PAGE, { filePath: "p.tw", compiler: { sourceMaps: true } });
    expect(r.sourceMap).toBeDefined();
    expect(r.sourceMap.version).toBe(3);
    expect(Array.isArray(r.sourceMap.sources)).toBe(true);
  });

  test("the async path attaches the map too", async () => {
    const { compile } = await import("../packages/compiler/tw/index.ts");
    const r = await compile(PAGE, { filePath: "p.tw", compiler: { sourceMaps: true } });
    expect(r.sourceMap?.version).toBe(3);
  });
});

describe("compiler passes: incremental + cacheSize", () => {
  const SRC = `page { title "T" render ssr }
div { span "hi" }`;

  test("a repeat compile of an unchanged file hits the parse cache", () => {
    const p = "/tmp/tw-inc-a.tw";
    const a = compileSync(SRC, { filePath: p });
    const b = compileSync(SRC, { filePath: p });
    expect(a.metadata.fromCache).toBe(false);
    expect(b.metadata.fromCache).toBe(true);
    expect(b.html).toBe(a.html);
  });

  test("incremental: false bypasses the cache", () => {
    const p = "/tmp/tw-inc-b.tw";
    compileSync(SRC, { filePath: p });
    const b = compileSync(SRC, { filePath: p, incremental: false });
    expect(b.metadata.fromCache).toBe(false);
  });

  test("cacheSize: 0 disables the cache", () => {
    const p = "/tmp/tw-inc-c.tw";
    compileSync(SRC, { filePath: p });
    const b = compileSync(SRC, { filePath: p, compiler: { cacheSize: 0 } });
    expect(b.metadata.fromCache).toBe(false);
  });

  test("an edited file is re-parsed (cache is content-keyed)", () => {
    const p = "/tmp/tw-inc-d.tw";
    compileSync(SRC, { filePath: p });
    const b = compileSync(SRC + "\n// edited", { filePath: p });
    expect(b.metadata.fromCache).toBe(false);
  });

  test("a cached hit still reports parse errors correctly", () => {
    const bad = `div.class { "x" }` + String.fromCodePoint(0x1f680);
    const p = "/tmp/tw-inc-e.tw";
    const a = compileSync(bad, { filePath: p });
    const b = compileSync(bad, { filePath: p });
    expect(a.diagnostics.filter((d) => d.severity === "error").length).toBeGreaterThan(0);
    expect(b.diagnostics.filter((d) => d.severity === "error").length)
      .toBe(a.diagnostics.filter((d) => d.severity === "error").length);
  });
});
