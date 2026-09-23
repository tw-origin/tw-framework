/**
 * Source masking for raw-source scanners.
 *
 * This document covers one thing completely: blanking out string literals
 * and comments so regex-based scanners (render mode, revalidate windows,
 * cache directives) never match words that live inside quotes or comments.
 *
 * Structure is preserved: the output has the exact same length as the
 * input and newlines stay where they were, so any position math done on
 * the masked text maps 1:1 back to the original source.
 *
 * What is masked:
 *   - 'single quoted'   strings
 *   - "double quoted"   strings
 *   - `template`        literals (whole thing, including ${...} holes)
 *   - // line comments
 *   - /* block comments * /
 *
 * Escape sequences (\", \', \\, \n, ...) are honored inside strings so a
 * quote inside an escape never ends the string early.
 *
 * Example:
 *   page { title "docs about render ssr" render static }
 *                     ^^^^^^^^^^^^^^^^^^^^ masked -> spaces
 *   after masking only the real `render static` directive is left.
 */

/** Mask everything except newlines (kept for line-accurate diagnostics). */
function blank(s: string): string {
  return s.replace(/[^\n]/g, " ");
}

/**
 * Mask strings and comments in .tw / .ts source text.
 * Returns a same-length string with strings/comments replaced by spaces.
 */
export function maskSourceStringsAndComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j = Math.min(j + 2, n); // include the closing */ when present
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }

    // Strings (double, single, template)
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        const c = src[j];
        if (c === "\\") {
          j += 2; // honor escapes: \" \' \\ \` etc.
          continue;
        }
        if (c === ch) {
          j++; // include closing quote
          break;
        }
        // template expression holes are part of the string for masking
        j++;
      }
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}
