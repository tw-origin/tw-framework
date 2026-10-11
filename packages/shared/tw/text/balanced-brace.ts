/**
 * Balanced-brace scanning for raw-source extraction.
 *
 * This document covers one thing completely: finding the brace that matches
 * an opening `{` while ignoring braces that live inside string literals,
 * template literals or comments -- so a `}` inside a string or a `// }`
 * comment never ends a block early. It reuses the same masking as the other
 * raw-source scanners, so every position maps 1:1 back to the original text.
 */

import { maskSourceStringsAndComments } from "../source-mask";

/**
 * Index of the `}` that matches the `{` at `openIndex` (which must point at a
 * `{`). String/comment/template-aware. Returns `src.length` when the brace is
 * never closed.
 */
export function findBalancedBraceEnd(src: string, openIndex: number): number {
  const masked = maskSourceStringsAndComments(src);
  let depth = 0;
  for (let i = openIndex; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length;
}
