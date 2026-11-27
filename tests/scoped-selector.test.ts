import { describe, test, expect } from "bun:test";
import { scopeSelector } from "../packages/compiler/tw/codegen/css-extract.ts";

// Characterisation tests for `compiler.scopedStyles`.
//
// These lock the CURRENT output of `scopeSelector`, including the cases that are
// wrong. They are deliberately not "correct behaviour" tests: the point is that
// a change to scoping shows up as a diff here, not as a silent change in what
// every scoped page ships.
//
// Known bugs are marked BUG below and tracked in docs/known-issues.md. Do not
// fix them by editing these expectations alone -- fix the function, then update
// the row and say so in the changelog.

const S = (sel: string) => scopeSelector(sel, "s1");

describe("scoped selector rewriting (current behaviour)", () => {
  test("a class takes the scope attribute", () => {
    expect(S(".card")).toBe('.card[data-tw-scope="s1"]');
  });

  test("an id takes the scope attribute", () => {
    expect(S("#id")).toBe('#id[data-tw-scope="s1"]');
  });

  test("a bare element takes the scope attribute", () => {
    expect(S("div")).toBe('div[data-tw-scope="s1"]');
  });

  test("a child combinator scopes the compound that follows it", () => {
    expect(S("> .child")).toBe('> .child[data-tw-scope="s1"]');
  });

  test("only the first compound of a descendant selector is scoped", () => {
    // Not a bug in the same sense as the ones below -- it is a narrower scope
    // than "every compound", and pages rely on it today.
    expect(S(".a .b")).toBe('.a[data-tw-scope="s1"] .b');
  });

  test("only the first compound before a sibling combinator is scoped", () => {
    expect(S("h2 + p")).toBe('h2[data-tw-scope="s1"] + p');
  });

  test("a comma-separated list scopes every part", () => {
    expect(S(".a, .b")).toBe('.a[data-tw-scope="s1"],.b[data-tw-scope="s1"]');
  });

  // ---- BUG: :is() -----------------------------------------------------------
  // The attribute is appended to `:is` itself, which is not a valid selector,
  // and the comma inside the argument is treated as a list separator so the
  // second argument gets scoped too. css-tree rejects this output.
  test("BUG: :is() is mangled", () => {
    expect(S(":is(.a, .b)")).toBe(':is[data-tw-scope="s1"](.a,.b[data-tw-scope="s1"])');
  });

  // ---- BUG: :not() ----------------------------------------------------------
  // Same shape: `:not[data-tw-scope="s1"](.x)` is invalid CSS.
  test("BUG: :not() is mangled", () => {
    expect(S(":not(.x)")).toBe(':not[data-tw-scope="s1"](.x)');
  });

  // ---- BUG: :has() ----------------------------------------------------------
  // Same shape again; `:has[data-tw-scope="s1"](> img)` is invalid CSS.
  test("BUG: :has() is mangled", () => {
    expect(S(":has(> img)")).toBe(':has[data-tw-scope="s1"](> img)');
  });

  // ---- BUG: & with a pseudo-class ------------------------------------------
  // Valid syntax but the wrong meaning: the attribute lands after the
  // pseudo-class, so it tests the hovered element rather than scoping the rule.
  test("BUG: &:hover puts the attribute after the pseudo-class", () => {
    expect(S("&:hover")).toBe('&:hover[data-tw-scope="s1"]');
  });

  // ---- BUG: & with a pseudo-element ----------------------------------------
  test("BUG: &::before puts the attribute after the pseudo-element", () => {
    expect(S("&::before")).toBe('&::before[data-tw-scope="s1"]');
  });

  // ---- BUG: universal selector ---------------------------------------------
  // `*` matches no `[.#]?[\w-]+` token, so it comes out unscoped -- the rule
  // silently applies to the whole document instead of the component.
  test("BUG: * is left unscoped", () => {
    expect(S("*")).toBe("*");
  });

  test("the scope id is interpolated as given", () => {
    expect(scopeSelector(".x", "page-7")).toBe('.x[data-tw-scope="page-7"]');
  });
});
