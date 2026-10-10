/**
 * TW088 -- deprecated import path.
 *
 * The four old string-conversion names stay as aliases so deep imports keep
 * working, but a removal must never be a silent break. Importing one of them now
 * warns, naming the replacement and the release the name goes away in.
 *
 * The warning has to ship at least one release before the removal; that ordering
 * is what makes the removal safe, so it is pinned here.
 */
import { describe, expect, test } from "bun:test";

import { compileSync } from "../packages/compiler/tw/index.ts";
import { DEPRECATED_IMPORTS } from "../packages/compiler/tw/diagnostics/rules.ts";
import { ERROR_CODES } from "../packages/compiler/tw/diagnostics/codes.ts";

function diags(src: string) {
  const r = compileSync(src, { filePath: "t.tw" });
  return r.diagnostics || [];
}

const TRANSFORM = "@tw/shared/tw/utils/string/transform";

describe("TW088: deprecated string-conversion imports warn", () => {
  test("importing toHex warns", () => {
    const d = diags(`page { title "x" render ssr }\nimport { toHex } from "${TRANSFORM}"`);
    const hit = d.find((x) => x.code === "TW088");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("warning");
  });

  test("the warning names the replacement", () => {
    const d = diags(`page { title "x" render ssr }\nimport { toHex } from "${TRANSFORM}"`);
    const hit = d.find((x) => x.code === "TW088")!;
    expect(JSON.stringify(hit.suggestions ?? [])).toContain("stringToHex");
  });

  test("the warning names the removal release", () => {
    const d = diags(`page { title "x" render ssr }\nimport { fromHex } from "${TRANSFORM}"`);
    const hit = d.find((x) => x.code === "TW088")!;
    expect(JSON.stringify(hit.suggestions ?? [])).toContain("2.1.0");
  });

  test("all four deprecated names warn", () => {
    for (const name of ["toHex", "fromHex", "toBinary", "fromBinary"]) {
      const d = diags(`page { title "x" render ssr }\nimport { ${name} } from "${TRANSFORM}"`);
      expect(d.some((x) => x.code === "TW088")).toBe(true);
    }
  });

  test("several deprecated names in one import warn separately", () => {
    const d = diags(`page { title "x" render ssr }\nimport { toHex, toBinary } from "${TRANSFORM}"`);
    expect(d.filter((x) => x.code === "TW088").length).toBe(2);
  });
});

describe("TW088: no false positives", () => {
  test("the new names do not warn", () => {
    const d = diags(`page { title "x" render ssr }\nimport { stringToHex, hexToString } from "${TRANSFORM}"`);
    expect(d.some((x) => x.code === "TW088")).toBe(false);
  });

  test("an unrelated name from the same module does not warn", () => {
    const d = diags(`page { title "x" render ssr }\nimport { slugify } from "${TRANSFORM}"`);
    expect(d.some((x) => x.code === "TW088")).toBe(false);
  });

  test("toHex from the NUMBER module does not warn (different contract)", () => {
    const d = diags(`page { title "x" render ssr }\nimport { toHex } from "@tw/shared/tw/utils/number/format"`);
    expect(d.some((x) => x.code === "TW088")).toBe(false);
  });

  test("a side-effect import does not warn", () => {
    const d = diags(`page { title "x" render ssr }\nimport "${TRANSFORM}"`);
    expect(d.some((x) => x.code === "TW088")).toBe(false);
  });
});

describe("TW088: the deprecation table is well-formed", () => {
  test("the code is no longer reserved", () => {
    expect((ERROR_CODES as Record<string, { reserved?: boolean }>).TW088.reserved).toBeFalsy();
  });

  test("every entry has a replacement and a removal release", () => {
    expect(DEPRECATED_IMPORTS.length).toBeGreaterThan(0);
    for (const e of DEPRECATED_IMPORTS) {
      expect(e.replacement.length).toBeGreaterThan(0);
      expect(e.removal).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test("the removal release is after the release that ships the warning", () => {
    // The warning ships in 2.0.0; removal must be a later release.
    for (const e of DEPRECATED_IMPORTS) {
      expect(e.removal.localeCompare("2.0.0")).toBeGreaterThan(0);
    }
  });

  test("every deprecated name has a replacement that is NOT also deprecated", () => {
    const deprecatedNames = new Set(DEPRECATED_IMPORTS.map((e) => e.name));
    for (const e of DEPRECATED_IMPORTS) {
      expect(deprecatedNames.has(e.replacement)).toBe(false);
    }
  });
});
