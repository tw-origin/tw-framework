import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isUnenumeratedParam } from "../packages/server/tw/routing/twm-loader.ts";

// `tw serve` returned 404 for a dynamic route whose params.twm did not enumerate
// the requested value; `tw dev` rendered the page anyway, so a URL that is dead
// in production worked in development. Both now call this one function, so this
// is the decision point for "known param renders, unknown param 404s".

function project(paramsTwm?: string): { dir: string; page: string } {
  const dir = mkdtempSync(join(tmpdir(), "tw-enum-"));
  const pageDir = join(dir, "home", "p", "[id]");
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, "page.tw"), `page { title "P" render static }\ndiv { p "x" }\n`);
  if (paramsTwm !== undefined) writeFileSync(join(pageDir, "params.twm"), paramsTwm);
  return { dir, page: join(pageDir, "page.tw") };
}

const ENUM = `fn generate() {\n  return ["42", "99"]\n}\n`;

describe("enumerated dynamic routes", () => {
  test("a known param is not a 404", async () => {
    const { dir, page } = project(ENUM);
    expect(await isUnenumeratedParam(page, { id: "42" }, dir)).toBe(false);
    expect(await isUnenumeratedParam(page, { id: "99" }, dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("an unknown param is a 404", async () => {
    const { dir, page } = project(ENUM);
    expect(await isUnenumeratedParam(page, { id: "nope" }, dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a static route (no [param] segment) is never a 404", async () => {
    const { dir } = project(ENUM);
    const staticPage = join(dir, "home", "page.tw");
    mkdirSync(join(dir, "home"), { recursive: true });
    writeFileSync(staticPage, `page { title "S" render static }\n`);
    expect(await isUnenumeratedParam(staticPage, {}, dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a page without params.twm is not a 404", async () => {
    const { dir, page } = project();
    expect(await isUnenumeratedParam(page, { id: "anything" }, dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a params.twm without generate() is not a 404", async () => {
    const { dir, page } = project(`export const x = 1;\n`);
    expect(await isUnenumeratedParam(page, { id: "anything" }, dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a broken params.twm must not turn every request into a 404", async () => {
    const { dir, page } = project(`fn generate() { throw new Error("boom") }\n`);
    expect(await isUnenumeratedParam(page, { id: "42" }, dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("an empty generate() does not 404 everything", async () => {
    const { dir, page } = project(`fn generate() {\n  return []\n}\n`);
    expect(await isUnenumeratedParam(page, { id: "42" }, dir)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a plain string list is treated as the first param", async () => {
    const { dir, page } = project(`fn generate() {\n  return ["a", "b"]\n}\n`);
    expect(await isUnenumeratedParam(page, { id: "a" }, dir)).toBe(false);
    expect(await isUnenumeratedParam(page, { id: "z" }, dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
