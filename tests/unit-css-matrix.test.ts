/**
 * CSS matrix: every CSS_PROPERTIES entry compiles in TSS, shorthands
 * expand, functions/media/pseudo/units pass through (Next.js it.each).
 */
import { describe, expect, test } from "bun:test";
import { compileTSS } from "../packages/compiler/tw/index.ts";
import {
  CSS_PROPERTIES, CSS_FUNCTIONS, CSS_MEDIA_FEATURES, CSS_PSEUDO_CLASSES,
  CSS_LENGTH_UNITS, CSS_ALIASES,
} from "../packages/shared/tw/index.ts";
import { TSS_SHORTHANDS } from "../packages/compiler/tw/codegen/tss.ts";

describe("CSS properties matrix (it.each over CSS_PROPERTIES)", () => {
  for (const prop of CSS_PROPERTIES) {
    test(`${prop}: compiles in TSS`, () => {
      const css = compileTSS(`.x { ${prop}: inherit }`);
      expect(css).toContain(`${prop}: inherit`);
    });
  }
});

describe("TSS shorthand matrix (it.each over TSS_SHORTHANDS)", () => {
  for (const [short, full] of Object.entries(TSS_SHORTHANDS)) {
    test(`${short} expands to ${full}`, () => {
      const css = compileTSS(`.x { ${short} red }`);
      expect(css).toContain(`${full}: red`);
    });
  }
});

describe("CSS alias table consistency (it.each over CSS_ALIASES)", () => {
  for (const [alias, expansion] of Object.entries(CSS_ALIASES)) {
    test(`${alias} maps to a real property`, () => {
      expect(CSS_PROPERTIES.has(expansion as string)).toBe(true);
    });
  }
});

describe("CSS functions matrix (it.each over CSS_FUNCTIONS)", () => {
  for (const fn of CSS_FUNCTIONS) {
    test(`${fn}() passes through`, () => {
      const css = compileTSS(`.x { color: ${fn}(1) }`);
      expect(css).toContain(`${fn}(1)`);
    });
  }
});

describe("CSS media features matrix (it.each over CSS_MEDIA_FEATURES)", () => {
  for (const mf of CSS_MEDIA_FEATURES) {
    test(`@media (${mf}: 1) compiles`, () => {
      const css = compileTSS(`@media (${mf}: 1) { .x { color: red } }`);
      expect(css).toContain(`(${mf}:`);
    });
  }
});

describe("CSS pseudo classes matrix (it.each over CSS_PSEUDO_CLASSES)", () => {
  for (const pc of CSS_PSEUDO_CLASSES) {
    test(`:${pc} compiles`, () => {
      const css = compileTSS(`.x:${pc} { color: red }`);
      expect(css).toContain(`:${pc}`);
    });
  }
});

describe("CSS length units matrix (it.each over CSS_LENGTH_UNITS)", () => {
  for (const u of CSS_LENGTH_UNITS) {
    test(`1${u} passes through`, () => {
      const css = compileTSS(`.x { width: 1${u} }`);
      expect(css).toContain(`1${u}`);
    });
  }
});
