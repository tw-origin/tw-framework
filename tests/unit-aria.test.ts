/**
 * ARIA matrix: every ARIA_ROLES entry is accepted (no TW044), every
 * ARIA_ATTRIBUTES entry passes through; unknown values are rejected.
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { ARIA_ROLES, ARIA_ATTRIBUTES } from "../packages/shared/tw/index.ts";

const tmp = "/tmp/tw2k-aria.tw";
const compile = (src: string) => compileSync(src, { filePath: tmp });

// ARIA abstract roles (command/input/landmark/...) are type-system
// roles only -- markup must not use them, so the compiler rejects them.
const ABSTRACT_ROLES = new Set(["command", "composite", "input", "landmark", "range", "roletype", "section", "sectionhead", "select", "structure", "widget", "window"]);

describe("ARIA roles matrix (it.each over ARIA_ROLES)", () => {
  for (const role of ARIA_ROLES) {
    if (ABSTRACT_ROLES.has(role)) continue;
    test(`role "${role}" is accepted`, () => {
      const out = compile(`page { title "T" }\ndiv { span role "${role}" { "x" } }`);
      expect(out.html).toContain(`role="${role}"`);
      expect((out.diagnostics ?? []).some((d: any) => d.code === "TW044")).toBe(false);
    });
  }
  for (const role of ARIA_ROLES) {
    if (!ABSTRACT_ROLES.has(role)) continue;
    test(`abstract role "${role}" is rejected with TW044`, () => {
      const out = compile(`page { title "T" }\ndiv { span role "${role}" { "x" } }`);
      expect((out.diagnostics ?? []).some((d: any) => d.code === "TW044")).toBe(true);
    });
  }
  test("unknown role triggers TW044", () => {
    const out = compile(`page { title "T" }\ndiv { span role "notarole" { "x" } }`);
    expect((out.diagnostics ?? []).some((d: any) => d.code === "TW044")).toBe(true);
  });
});

describe("ARIA attributes matrix (it.each over ARIA_ATTRIBUTES)", () => {
  for (const attr of ARIA_ATTRIBUTES) {
    test(`${attr} passes through`, () => {
      const out = compile(`page { title "T" }\ndiv { span ${attr} "v" { "x" } }`);
      expect(out.html).toContain(`${attr}="v"`);
      expect((out.diagnostics ?? []).some((d: any) => d.code === "TW045")).toBe(false);
    });
  }
});
