/**
 * `server:defer { }` -- a server block that runs after the first byte.
 *
 * The parse layer has always recorded the `:defer` modifier; these cover what it
 * now does: a deferred block cannot drive control flow (TW118), its values are
 * not available to the markup (TW119), and at runtime its values come back from
 * a thunk the server runs once the shell is on the wire.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkServerBlocks, parseWithDetails, collectReferencedNames } from "@tw/compiler";

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;

function app(pageSrc: string): any {
  const dir = mkdtempSync(join(tmpdir(), "tw-sb-defer-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), pageSrc);
  return new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, serverBlocks: true });
}
const req = () => new Request("http://localhost/");

describe("server:defer -- compile-time", () => {
  test("redirect() in a deferred block -> TW118", () => {
    const src = 'server { const a = "1" }\nserver:defer {\n  redirect("/x")\n}\np "a={a}"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW118")).toBe(true);
  });

  test("notFound() in a deferred block -> TW118", () => {
    const src = 'server:defer {\n  notFound()\n}\np "x"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW118")).toBe(true);
  });

  test("a clean deferred block passes", () => {
    const src = 'server { const a = "1" }\nserver:defer {\n  const log = "ok"\n}\np "a={a}"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW118")).toBe(false);
  });
});

describe("server:defer -- runtime", () => {
  test("the shell renders without the deferred value; the thunk resolves it", async () => {
    const p = app('page { title "P" render ssr }\nserver {\n  const a = "1"\n}\nserver:defer {\n  const b = a + "2"\n}\np "a={a}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.html).toContain("a=1");
    expect(r.html).not.toContain("b=12");
    expect(typeof r.deferred).toBe("function");
    // The deferred block sees the inline block's value `a`.
    const values = await r.deferred();
    expect(values.b).toBe("12");
  });

  test("a page without a deferred block has no thunk", async () => {
    const p = app('page { title "P" render ssr }\nserver {\n  const a = "1"\n}\np "a={a}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.deferred).toBeUndefined();
  });
});
