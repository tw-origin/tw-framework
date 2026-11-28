/**
 * Value-level CSS checks -- optional, and only ever a warning.
 *
 * The structural checks in `tss.ts` can see that a declaration is well formed
 * but not that `color: 12px` is wrong: that needs a grammar per property, which
 * is spec data. Rather than hand-maintain one, this uses `css-tree` when the
 * project already has it installed.
 *
 * Deliberate constraints:
 *   - The framework declares no dependency on css-tree. `dependencies` stays
 *     empty; when it is not installed this reports `skipped` and nothing else.
 *   - Findings are warnings (TW310), never errors. A scanner that guesses at
 *     value grammar will be wrong on something valid sooner or later, and that
 *     must not fail a build.
 *   - Callers validate the CSS as written, BEFORE any scoped-selector rewrite,
 *     so positions point at the file the developer edited.
 *
 * What it deliberately does NOT report is listed in docs/css-validation.md.
 */
export interface CssValueFinding {
  code: "TW310";
  message: string;
  line: number;
  col: number;
}

export interface CssValueResult {
  /** True when css-tree was unavailable and nothing was checked. */
  skipped: boolean;
  findings: CssValueFinding[];
}

/** Anything that can load css-tree; tests pass one that throws to prove `skipped`. */
export type CssTreeLoader = () => Promise<any>;

const defaultLoader: CssTreeLoader = () => import("css-tree" as string);

let cached: any = null;
let cachedFailed = false;

/** Declarations inside these at-rules are descriptors, not properties. */
const DESCRIPTOR_AT_RULES = new Set([
  "property", "font-face", "counter-style", "page", "viewport",
  "font-palette-values", "position-try",
]);

/**
 * @param css  CSS source as written (TSS already compiled, scoping NOT applied)
 * @param load optional loader override; `tw check` passes one that resolves
 *             css-tree from the user's project root
 */
export async function validateCssValues(
  css: string,
  load: CssTreeLoader = defaultLoader,
): Promise<CssValueResult> {
  let csstree: any;
  try {
    if (load === defaultLoader) {
      if (cachedFailed) return { skipped: true, findings: [] };
      if (cached) csstree = cached;
      else { csstree = await defaultLoader(); cached = csstree; }
    } else {
      csstree = await load();
    }
  } catch {
    if (load === defaultLoader) cachedFailed = true;
    return { skipped: true, findings: [] };
  }
  if (!csstree?.parse || !csstree?.lexer?.matchDeclaration) {
    return { skipped: true, findings: [] };
  }

  const findings: CssValueFinding[] = [];
  try {
    const ast = csstree.parse(css, { positions: true });

    // `@property { syntax: "<color>" }` is not the `syntax` property. The lexer
    // only knows properties, so it calls every descriptor unknown.
    const skip = new Set<any>();
    csstree.walk(ast, {
      visit: "Atrule",
      enter(node: any) {
        const name = String(node.name || "").toLowerCase();
        if (!DESCRIPTOR_AT_RULES.has(name) || !node.block) return;
        csstree.walk(node.block, {
          visit: "Declaration",
          enter(d: any) { skip.add(d); },
        });
      },
    });

    csstree.walk(ast, {
      visit: "Declaration",
      enter(node: any) {
        if (skip.has(node)) return;

        const prop = String(node.property || "");
        // Custom properties have no grammar to check against.
        if (prop.startsWith("--")) return;

        // `var()` makes the value undecidable at build time. This also skips the
        // property check, which is the documented limitation (docs/css-validation.md).
        let raw = "";
        try { raw = csstree.generate(node.value); } catch { raw = ""; }
        if (/var\(|env\(|attr\(/i.test(raw)) return;

        let problem: string | null = null;
        try {
          const res = csstree.lexer.matchDeclaration(node);
          if (res?.error) problem = String(res.error.message || "invalid value").split("\n")[0];
        } catch { /* a lexer failure on one declaration is not a finding */ }

        // "not applicable" / "not supported" mean the lexer could not decide.
        if (problem && /not applicable|not supported|Lexer matching/i.test(problem)) problem = null;
        if (!problem) return;

        findings.push({
          code: "TW310",
          message: `${prop}: ${problem}`,
          line: node.loc?.start?.line ?? 1,
          col: node.loc?.start?.column ?? 1,
        });
      },
    });
  } catch {
    // A stylesheet css-tree cannot parse at all is the structural pass's job.
    return { skipped: false, findings: [] };
  }
  return { skipped: false, findings };
}
