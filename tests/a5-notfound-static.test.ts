import { describe, test, expect } from "bun:test";
import { checkServerBlocks } from "../packages/compiler/tw/server-blocks/index.ts";
import { parseWithDetails } from "../packages/compiler/tw/index.ts";

// A5: notFound() in a static page's server block used to be a build error, so a
// missing record could only render a "not found" body with a 200 -- a soft 404
// that crawlers index. It is now allowed: the build skips the page and the host
// serves a real 404. redirect() stays blocked, because a static page is built
// before the request and has no response to redirect.

function problems(src: string, mode = "static") {
  const prog = (parseWithDetails as any)(src, { filePath: "/tmp/a5/page.tw", cache: false, experimental: { serverBlocks: true } }).program;
  return (checkServerBlocks as any)(prog, { mode, paramNames: ["slug"], hasEnumeratedParams: true });
}

const PAGE = (block: string, mode = "static") => `page { title "T" render ${mode} }\nserver {\n${block}\n}\ndiv { p "x" }\n`;

describe("A5: notFound() in a static block", () => {
  test("notFound() is allowed", () => {
    const codes = problems(PAGE(`  const app = getApp(params.slug)\n  if (!app) notFound()`)).map((p: any) => p.code);
    expect(codes).not.toContain("TW108");
  });

  test("redirect() is still rejected", () => {
    const codes = problems(PAGE(`  redirect("/somewhere")`)).map((p: any) => p.code);
    expect(codes).toContain("TW108");
  });

  test("a block that calls neither is unaffected", () => {
    expect(problems(PAGE(`  const rows = [1, 2]`))).toEqual([]);
  });

  test("notFound() is still fine in an ssr page", () => {
    const codes = problems(PAGE(`  if (!getApp(params.slug)) notFound()`, "ssr")).map((p: any) => p.code);
    expect(codes).not.toContain("TW108");
  });

  test("the TW108 message no longer mentions notFound()", () => {
    const p = problems(PAGE(`  redirect("/x")`)).find((x: any) => x.code === "TW108");
    expect(p?.message ?? "").toContain("redirect()");
    expect(p?.message ?? "").not.toContain("notFound()");
  });
});
