/**
 * Render modes round (docs/30): Suspense codegen, deterministic boundary
 * ids, csrifyHtml shells, and frontmatter mode validation.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compile = async () => (await import("../packages/compiler/tw/index.ts")).compileSync as any;

const tmp = mkdtempSync(join(tmpdir(), "tw-modes-"));

describe("Suspense codegen (docs/90)", () => {
  test("fallback marker + children compile to a swap boundary", async () => {
    const compileSync = await compile();
    const src = [
      "page { title \"S\" render static }",
      "",
      "div {",
      "  Suspense { fallback div.loading { \"Loading...\" }",
      "    div.data { \"Heavy\" }",
      "  }",
      "}",
    ].join("\n");
    const out = compileSync(src, { filePath: join(tmp, "s1.tw") });
    // No literal <Suspense> tag may survive
    expect(out.html).not.toContain("<Suspense>");
    // Fallback div is visible markup, content is a hidden template
    expect(out.html).toMatch(/<div data-tw-suspense="tw-s-[^"]+">/);
    expect(out.html).toMatch(/<div data-tw-suspense-fallback="tw-s-[^"]+"><div class="loading">Loading\.\.\.<\/div><\/div>/);
    expect(out.html).toMatch(/<template data-tw-content="tw-s-[^"]+" hidden><div class="data">Heavy<\/div><\/template>/);
    // The swap runtime ships with the page
    expect(out.html).toContain("__TW_RESOLVE__");
  });

  test("boundary ids are deterministic across compiles of the same source", async () => {
    const compileSync = await compile();
    const src = 'page { title \"D\" render ppr }\n\ndiv { Suspense { fallback div.loading { \"L\" } div.d { \"C\" } } }\n';
    const idOf = (h: string) => h.match(/data-tw-content="(tw-s-[^"]+)"/)?.[1];
    const a = idOf(compileSync(src, { filePath: join(tmp, "d1.tw") }).html);
    const b = idOf(compileSync(src, { filePath: join(tmp, "d1.tw") }).html);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  test("render csr/stream/ppr are accepted frontmatter modes", async () => {
    const compileSync = await compile();
    for (const mode of ["csr", "stream", "ppr"]) {
      const out = compileSync(`page { title "M" render ${mode} }\n\ndiv { "x" }\n`, {
        filePath: join(tmp, "m-" + mode + ".tw"),
      });
      const invalid = (out.diagnostics ?? []).filter((d: any) => /Invalid render mode/.test(d.message ?? ""));
      expect(invalid).toEqual([]);
    }
  });
});

describe("csr shell emission", () => {
  test("csrifyHtml moves markup into a client-rendered template", async () => {
    const build = await import("../apps/cli/tw/commands/build.ts") as any;
    const html = [
      "<!DOCTYPE html>",
      '<html lang="en"><head><title>CSR</title></head>',
      '<body><div class="app"><h1>Client</h1></div></body></html>',
    ].join("\n");
    const out = build.csrifyHtml(html);
    // The visible DOM is empty until the client builds it
    expect(out).toContain('<div id="tw-root"></div>');
    expect(out).toContain('<template id="tw-csr-template">');
    expect(out).toContain("<h1>Client</h1>");
    // Bootstrap instantiates the template content
    expect(out).toContain("cloneNode(true)");
    // No server-rendered body markup outside the template
    expect(out).not.toMatch(/<body><div class="app">/);
  });

  test("extractRenderMode reads the frontmatter mode", async () => {
    const build = await import("../apps/cli/tw/commands/build.ts") as any;
    expect(build.extractRenderMode('page {\n  render stream\n}')).toBe("stream");
    expect(build.extractRenderMode("page {\n  render static\n}")).toBe("static");
    expect(build.extractRenderMode("page {\n  title \"x\"\n}")).toBe("static");
  });
});

describe("render pipeline exposes the page's render mode", () => {
  test("result.renderMode reflects the frontmatter", async () => {
    const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts");
    const root = join(tmp, "mode-app");
    mkdirSync(join(root, "home"), { recursive: true });
    writeFileSync(
      join(root, "home", "page.tw"),
      'page { title "M" render stream }\n\ndiv { h1 "Streamed" }\n',
    );
    const pipeline = new RenderPipeline({
      rootDir: root,
      homeDir: join(root, "home"),
      enableCache: false,
    } as any);
    const out: any = pipeline.render("/");
    expect(out.renderMode).toBe("stream");
  });
});
