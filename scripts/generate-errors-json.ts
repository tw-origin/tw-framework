/**
 * Regenerate errors.json (the machine-readable error registry) from the
 * compiler's ERROR_CODES table. Run after adding a diagnostic:
 *
 *   bun scripts/generate-errors-json.ts
 */
import { ERROR_CODES } from "../packages/compiler/tw/diagnostics/codes.ts";
import { writeFileSync } from "node:fs";

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  count: Object.keys(ERROR_CODES).length,
  codes: ERROR_CODES,
};

writeFileSync("errors.json", JSON.stringify(out, null, 2) + "\n");
console.log(`errors.json: ${out.count} codes written`);
