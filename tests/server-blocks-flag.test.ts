/**
 * Server blocks are on by default (`server.blocks`). These cover the default,
 * the opt-out, and the legacy `experimental.serverBlocks` alias.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWithDetails, collectServerBlocks } from "@tw/compiler";

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const PAGE = 'page { title "P" render ssr }\nserver {\n  const a = "1"\n}\np "a={a}"\n';
const req = () => new Request("http://localhost/");

function app(pageSrc: string, opts: Record<string, unknown> = {}): any {
  const dir = mkdtempSync(join(tmpdir(), "tw-sb-flag-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), pageSrc);
  return new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, ...opts });
}

describe("server blocks: on by default", () => {
  test("a server { } block runs with no flag set", async () => {
    const r = await app(PAGE).renderWithServerBlocks("/", req());
    expect(r.html).toContain("a=1");
  });

  test("server.blocks:false turns blocks off", async () => {
    const r = await app(PAGE, { serverBlocks: false }).renderWithServerBlocks("/", req());
    expect(r.html).not.toContain("a=1");
  });

  test("the parser parses server blocks with no flag", () => {
    const prog = parseWithDetails('server { const a = "1" }\np "x"\n', { filePath: "<t>", cache: false } as any).program;
    expect(collectServerBlocks(prog).length).toBe(1);
  });

  test("the parser still honours the legacy experimental.serverBlocks alias", () => {
    const off = parseWithDetails('server { const a = "1" }\np "x"\n', { filePath: "<t>", cache: false, experimental: { serverBlocks: false } } as any).program;
    expect(collectServerBlocks(off).length).toBe(0);
    const on = parseWithDetails('server { const a = "1" }\np "x"\n', { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any).program;
    expect(collectServerBlocks(on).length).toBe(1);
  });
});
