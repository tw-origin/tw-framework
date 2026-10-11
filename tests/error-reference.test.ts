/**
 * The error-reference contract: every diagnostic the server-block feature adds
 * must have a documented entry in docs/error-reference.md. Adding a code without
 * a page for it fails here.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ERROR_CODES } from "../packages/compiler/tw/diagnostics/codes.ts";

const SERVER_BLOCK_CODES = Object.keys(ERROR_CODES).filter((c) => {
  const n = Number(c.slice(2));
  return n >= 99 && n <= 117;
});

test("the server-block feature declares its diagnostic codes", () => {
  expect(SERVER_BLOCK_CODES.length).toBeGreaterThanOrEqual(19);
});

test("every server-block diagnostic has an error-reference entry", () => {
  const doc = readFileSync(join(import.meta.dir, "..", "docs", "error-reference.md"), "utf8");
  const missing = SERVER_BLOCK_CODES.filter((code) => !doc.includes(`### ${code} —`));
  expect(missing).toEqual([]);
});
