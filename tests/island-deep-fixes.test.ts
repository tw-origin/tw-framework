/**
 * Deep re-check of the island work: the same-name bug, the stale-SSR bug, the
 * `@client:visible` download deferral -- and the three gaps a unit-only test
 * missed, all of which lived in the same-name fix itself.
 *
 * Same name, different files. The registry was keyed by name alone, so
 *   two components that both default-export `Counter` in different folders
 *   collapsed to one entry: the second page rendered the first page's
 *   component. Silent wrong output.
 *
 * Stale SSR render. `loadSsrRenderer` stamped its built module by
 *   path+engine and then `import()`ed it. `import()` caches by URL, so after a
 *   component was edited the old render kept being served for the rest of the
 *   process -- exactly a `tw dev` session.
 *
 * POWER -- `@client:visible` now defers the DOWNLOAD, not just hydration.
 *
 * The three gaps the first pass missed (found by re-checking the fix itself):
 *   1. `scanForeignImports` still deduped by NAME, so the second same-named
 *      component was never scanned, let alone built.
 *   2. `generateHTML` walked `program.body` for imports -- but body holds only
 *      elements; imports are on `program.directives`. The specifier map was
 *      therefore always empty and every lookup fell back to the name.
 *   3. the unknown-tag guard called `resolveForeignComponent(tag)` with no
 *      specifier, so once the name-only entry was dropped for ambiguity it
 *      reported a valid component as unknown.
 * The END TO END tests at the bottom are the ones that matter: they exercise
 * scan -> register -> compile -> look up, which is where all three lived.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { scanForeignImports, collectTwFiles, loadSsrRenderer, parseClientStrategy } from "../apps/cli/tw/commands/island-bundle.ts";
import { compileSync } from "../packages/compiler/tw/index.ts";
import {
  registerForeignComponent,
  resolveForeignComponent,
  clearForeignComponents,
  islandWrapper,
  foreignComponentNames,
} from "../packages/compiler/tw/codegen/foreign-components.ts";

const repoNodeModules = join(resolve(import.meta.dir, ".."), "node_modules");

describe("same name, different files", () => {
  test("the registry tells them apart by specifier", () => {
    clearForeignComponents();
    registerForeignComponent("Counter", "@./a/Counter.tsx", { engine: "react", source: "/a/Counter.tsx", render: () => "A" });
    registerForeignComponent("Counter", "@./b/Counter.tsx", { engine: "preact", source: "/b/Counter.tsx", render: () => "B" });

    expect(resolveForeignComponent("Counter", "@./a/Counter.tsx")!.render({}, "")).toBe("A");
    expect(resolveForeignComponent("Counter", "@./b/Counter.tsx")!.render({}, "")).toBe("B");
    // and the engines did not bleed into each other either
    expect(resolveForeignComponent("Counter", "@./a/Counter.tsx")!.engine).toBe("react");
    expect(resolveForeignComponent("Counter", "@./b/Counter.tsx")!.engine).toBe("preact");
    clearForeignComponents();
  });

  test("a lookup without a specifier still resolves when the name is unique", () => {
    clearForeignComponents();
    registerForeignComponent("Only", "@./only.tsx", { engine: "react", render: () => "X" });
    expect(resolveForeignComponent("Only")!.render({}, "")).toBe("X");
    clearForeignComponents();
  });

  test("an ambiguous name resolves to null without a specifier (loud, not wrong)", () => {
    clearForeignComponents();
    registerForeignComponent("Counter", "@./a/Counter.tsx", { engine: "react", render: () => "A" });
    registerForeignComponent("Counter", "@./b/Counter.tsx", { engine: "preact", render: () => "B" });
    // Two components share the name, so the name-only entry is gone. Neither a
    // specifier-less lookup nor a specifier matching neither file may silently
    // hand back A or B -- an unknown tag must be reported as unknown.
    expect(resolveForeignComponent("Counter")).toBeNull();
    expect(resolveForeignComponent("Counter", "@./c/Counter.tsx")).toBeNull();
    // ...while the exact specifiers still resolve to the right component.
    expect(resolveForeignComponent("Counter", "@./a/Counter.tsx")!.render({}, "")).toBe("A");
    expect(resolveForeignComponent("Counter", "@./b/Counter.tsx")!.render({}, "")).toBe("B");
    clearForeignComponents();
  });

  test("foreignComponentNames reports plain names, not the internal keys", () => {
    clearForeignComponents();
    registerForeignComponent("Counter", "@./a/Counter.tsx", { engine: "react", render: () => "A" });
    registerForeignComponent("Widget", "@./w.tsx", { engine: "react", render: () => "W" });
    expect(foreignComponentNames().sort()).toEqual(["Counter", "Widget"]);
    clearForeignComponents();
  });

  test("the scan finds BOTH files, not just the first", () => {
    const root = mkdtempSync(join(tmpdir(), "tw-deep1-"));
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    mkdirSync(join(root, "p1"), { recursive: true });
    mkdirSync(join(root, "p2"), { recursive: true });
    writeFileSync(join(root, "a", "Counter.tsx"), `export default function Counter() { return <div>A</div>; }\n`);
    writeFileSync(join(root, "b", "Counter.tsx"), `export default function Counter() { return <div>B</div>; }\n`);
    writeFileSync(join(root, "p1", "page.tw"), `import Counter from "@./a/Counter.tsx"\npage { title "1" render static }\nCounter { }\n`);
    writeFileSync(join(root, "p2", "page.tw"), `import Counter from "@./b/Counter.tsx"\npage { title "2" render static }\nCounter { }\n`);

    const found = scanForeignImports(root, collectTwFiles(root));
    // Keying on the name alone built only the first file, so the second page
    // fell back to it and rendered the wrong component.
    expect(found.length).toBe(2);
    expect(found.map((f) => f.specifier).sort()).toEqual(["@./a/Counter.tsx", "@./b/Counter.tsx"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("END TO END: each page renders the component it actually imported", () => {
    clearForeignComponents();
    registerForeignComponent("Counter", "@./a/Counter.tsx", { engine: "react", render: () => "<div>AA</div>" });
    registerForeignComponent("Counter", "@./b/Counter.tsx", { engine: "preact", render: () => "<div>BB</div>" });
    const p1: any = compileSync('import Counter from "@./a/Counter.tsx"\npage { title "1" render static }\nCounter { }\n', { filePath: "p1.tw" });
    const p2: any = compileSync('import Counter from "@./b/Counter.tsx"\npage { title "2" render static }\nCounter { }\n', { filePath: "p2.tw" });

    // This is the whole chain: scan -> register -> compile -> look up by the
    // page's own specifier. It is what caught the three gaps a unit test missed.
    expect(p1.html).toContain("<div>AA</div>");
    expect(p2.html).toContain("<div>BB</div>");
    expect(p1.html).not.toContain("<div>BB</div>");
    expect(p2.html).not.toContain("<div>AA</div>");
    clearForeignComponents();
  });

  test("END TO END: a page whose specifier matches nothing reports unknown, never the wrong component", () => {
    clearForeignComponents();
    registerForeignComponent("Counter", "@./a/Counter.tsx", { engine: "react", render: () => "<div>AA</div>" });
    registerForeignComponent("Counter", "@./b/Counter.tsx", { engine: "preact", render: () => "<div>BB</div>" });
    const p3: any = compileSync('import Counter from "@./c/Counter.tsx"\npage { title "3" render static }\nCounter { }\n', { filePath: "p3.tw" });
    expect(p3.html).not.toContain("<div>AA</div>");
    expect(p3.html).not.toContain("<div>BB</div>");
    expect(p3.html).toContain("unknown component");
    clearForeignComponents();
  });
});

describe("an edited component renders fresh", () => {
  let root: string;
  let file: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tw-deep2-"));
    mkdirSync(join(root, "components"), { recursive: true });
    symlinkSync(repoNodeModules, join(root, "node_modules"), "dir");
    file = join(root, "components", "Box.tsx");
    writeFileSync(file, `export default function Box() { return <div>FIRST</div>; }\n`);
  });

  afterAll(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  test("the first render is correct", async () => {
    const render = await loadSsrRenderer(root, file, "preact");
    expect(render({}, "")).toContain("FIRST");
  });

  test("after editing the file, the next render reflects the edit", async () => {
    writeFileSync(file, `export default function Box() { return <div>SECOND</div>; }\n`);
    const render = await loadSsrRenderer(root, file, "preact");
    expect(render({}, "")).toContain("SECOND");
    expect(render({}, "")).not.toContain("FIRST");
  });

  test("and again, so it is not a one-off", async () => {
    writeFileSync(file, `export default function Box() { return <div>THIRD</div>; }\n`);
    const render = await loadSsrRenderer(root, file, "preact");
    expect(render({}, "")).toContain("THIRD");
  });
});

describe("POWER: @client:visible defers the download", () => {
  test("a visible island carries data-tw-defer-src, not data-tw-src", () => {
    const html = islandWrapper("Chart", "{}", "<div></div>", "/js/island-abc.js", true);
    expect(html).toContain('data-tw-defer-src="/js/island-abc.js"');
    expect(html).toContain('data-tw-defer="visible"');
    expect(html).not.toContain('data-tw-src=');
  });

  test("an eager island still carries data-tw-src", () => {
    const html = islandWrapper("Counter", "{}", "<div></div>", "/js/island-abc.js", false);
    expect(html).toContain('data-tw-src="/js/island-abc.js"');
    expect(html).not.toContain("data-tw-defer");
  });

  test("a server island carries neither (no JavaScript)", () => {
    const html = islandWrapper("Static", "{}", "<div></div>", undefined, false);
    expect(html).not.toContain("data-tw-src");
    expect(html).not.toContain("data-tw-defer");
  });

  test("only @client:visible defers; lazy and eager do not", () => {
    expect(parseClientStrategy(`// @client:visible`).strategy).toBe("visible");
    expect(parseClientStrategy(`// @client:lazy`).strategy).toBe("lazy");
    expect(parseClientStrategy(`// @client:eager`).strategy).toBe("eager");
  });
});
