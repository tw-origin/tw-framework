import { evaluate } from "./evaluate";
/** String interpolation - {{ expr }} evaluation. */


export function interpolate(template: string, vars: Record<string, string>): string {
  if (!template) return "";
  if (!template.includes("{")) return template;

  let result = "";
  let i = 0;

  while (i < template.length) {
    const ch = template[i];

    // Escapes: \{ and \} render literal braces and never start/stop
    // interpolation. This gives .tw pages a way to print real braces
    // (JSON examples, code samples, {x} in prose) without state-var
    // workarounds.
    if (ch === "\\") {
      const nxt = template[i + 1];
      if (nxt === "{" || nxt === "}") {
        result += nxt;
        i += 2;
        continue;
      }
    }

    if (ch === "{" && template[i + 1] !== "{") {
      let depth = 1;
      let j = i + 1;
      while (j < template.length && depth > 0) {
        if (template[j] === "{") depth++;
        else if (template[j] === "}") depth--;
        if (depth === 0) break;
        j++;
      }

      if (depth === 0) {
        const expr = template.slice(i + 1, j);
        result += evaluate(expr.trim(), vars);
        i = j + 1;
        continue;
      }
    }

    // Double brace {{ }} -- also interpolate
    if (ch === "{" && template[i + 1] === "{") {
      const endIdx = template.indexOf("}}", i + 2);
      if (endIdx !== -1) {
        const expr = template.slice(i + 2, endIdx);
        result += evaluate(expr.trim(), vars);
        i = endIdx + 2;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

