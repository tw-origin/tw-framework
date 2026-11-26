import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveServerImports } from "../packages/compiler/tw/server-blocks/index.ts";
import { collectModuleImports } from "../apps/cli/tw/commands/server-boundary.ts";

// A `server { }` block runs with the bindings `resolveServerImports` gives it.
// Page-level imports used to be invisible to it -- the block got no binding and
// the executor's unknown-name stand-in (a Proxy) was called instead, which is
// the "query is an instance of ProxyObject" failure. These tests pin every
// import form so the plumbing cannot regress.

let root = "";

function project(files: Record<string, string>): { dir: string; page: string } {
  const dir = mkdtempSync(join(tmpdir(), "tw-blockimports-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, page: join(dir, "home", "p", "page.tw") };
}

/** Exactly what `tw build` does: page imports -> block imports. */
async function resolve(page: string, source: string, blockBody: string) {
  const pageLevel = collectModuleImports(source).filter(
    (imp) => imp.kind === "import" && imp.names.length > 0 &&
      imp.names.some((nm) => new RegExp("\\b" + nm.replace(/[$]/g, "\\$") + "\\b").test(blockBody)),
  );
  const out: Record<string, unknown> = {};
  if (pageLevel.length) Object.assign(out, await resolveServerImports({ imports: pageLevel } as any, page));
  return out;
}

const LIB = {
  "data/data.js": `export const named = "NAMED";
export default function def() { return "DEFAULT" }
export const nsValue = "NS";
`,
  "data/alias.js": `export const original = "ALIASED";\n`,
  "data/side.js": `globalThis.__sideEffect = true;\n`,
};

describe("server-block imports", () => {
  test("a page-level named import reaches the block", async () => {
    const { dir, page } = project({ ...LIB, "home/p/page.tw": "" });
    const out = await resolve(page, `import { named } from "../../data/data"`, "const a = named");
    expect(out.named).toBe("NAMED");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a default import reaches the block", async () => {
    const { dir, page } = project({ ...LIB, "home/p/page.tw": "" });
    const out = await resolve(page, `import def from "../../data/data"`, "const b = def()");
    expect(typeof out.def).toBe("function");
    expect((out.def as any)()).toBe("DEFAULT");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a namespace import is the module, not its default", async () => {
    const { dir, page } = project({ ...LIB, "home/p/page.tw": "" });
    const out = await resolve(page, `import * as ns from "../../data/data"`, "const c = ns.nsValue");
    expect((out.ns as any)?.nsValue).toBe("NS");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an aliased import binds the exported name to the local one", async () => {
    const { dir, page } = project({ ...LIB, "home/p/page.tw": "" });
    const out = await resolve(page, `import { original as renamed } from "../../data/alias"`, "const d = renamed");
    expect(out.renamed).toBe("ALIASED");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an import the block never references is not loaded", async () => {
    const { dir, page } = project({ ...LIB, "home/p/page.tw": "" });
    const out = await resolve(page, `import { named } from "../../data/data"\nimport { original } from "../../data/alias"`, "const a = named");
    expect(out.named).toBe("NAMED");
    expect(out.original).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("a side-effect page import binds nothing", async () => {
    const { dir, page } = project({ ...LIB, "home/p/page.tw": "" });
    const out = await resolve(page, `import "../../data/side"`, "const x = 1");
    expect(Object.keys(out)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a block-local import still works and wins over a page-level one", async () => {
    const { dir, page } = project({
      ...LIB,
      "data/local.js": `export const named = "BLOCK-LOCAL";\n`,
      "home/p/page.tw": "",
    });
    // page-level first, then block-local, exactly as build merges them
    const pageLevel = collectModuleImports(`import { named } from "../../data/data"`)
      .filter((imp) => imp.kind === "import" && imp.names.length > 0);
    const out: Record<string, unknown> = {};
    Object.assign(out, await resolveServerImports({ imports: pageLevel } as any, page));
    Object.assign(out, await resolveServerImports({ imports: [
      { source: `import { named } from "../../data/local"`, specifier: "../../data/local" },
    ] } as any, page));
    expect(out.named).toBe("BLOCK-LOCAL");
    rmSync(dir, { recursive: true, force: true });
  });

  test("collectModuleImports reports names and the statement text for every form", () => {
    const src = [
      `import { a, b as c } from "x"`,
      `import def from "y"`,
      `import * as ns from "z"`,
      `import "side"`,
    ].join("\n");
    const got = collectModuleImports(src);
    expect(got[0].names).toEqual(["a", "c"]);
    expect(got[0].source).toContain("import { a, b as c }");
    expect(got[1].names).toEqual(["def"]);
    expect(got[2].names).toEqual(["ns"]);
    expect(got[3].names).toEqual([]);
  });
});
