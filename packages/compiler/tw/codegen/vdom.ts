/** VDOM code generation and main generate function. */

import { type Program, type ASTNode } from "../ast/nodes";
import { type CodegenContext, type CodegenResult, createContext } from "./types";
import { generateHTML, generateNode, collectTssImports , programHasEvents , setActiveBuiltinImports } from "./html";
import { collectBuiltinImports } from "./builtin-components";
import type { ElementNode } from "../ast/nodes/elements";
import type { IfNode } from "../ast/nodes/control";
import type { PageDirective } from "../ast/nodes/directives";
import type { RenderDirective } from "../ast/nodes/directives";
import type { TextNode } from "../ast/nodes/types";
import type { CodegenMetadata } from "./types";

/**
 * Compile a page with a layout applied: the layout's `slot { }` receives the
 * page's body children (rendered with the page's own state), and the page's
 * <title> wins over the layout's.
 */
export function generateWithLayout(
  layoutProgram: Program,
  pageProgram: Program,
  stateVars?: Record<string, string>,
): string {
  const ctx = createContext("ssr");
  if (stateVars) ctx.stateVars = { ...stateVars };

  // Seed state from the PAGE (page state must be visible to its children).
  for (const dir of pageProgram.directives || []) {
    if (dir.type === "StateDirective") {
      for (const decl of dir.declarations || []) {
        ctx.stateVars[decl.name] = decl.value;
      }
    }
  }

  // Unwrap the layout's `html { body { ... } }` wrapper if present --
  // generateHTML already emits its own <html>/<head>/<body> scaffolding.
  const unwrapped: ASTNode[] = [];
  for (const n of layoutProgram.body || []) {
    const el: any = n;
    if (el.type === "Element" && el.tag === "html") {
      for (const c of el.children || []) {
        const ce: any = c;
        if (ce.type === "Element" && ce.tag === "body") {
          unwrapped.push(...(ce.children || []));
        } else if (ce.type === "Element" && ce.tag === "head") {
          // Layout-level <head> content: lift children into a HeadDirective
          // so generateHead picks them up.
          unwrapped.push({ type: "HeadDirective", body: ce.children || [], title: undefined, meta: [], links: [], scripts: [], line: ce.line, col: ce.col });
        } else {
          unwrapped.push(c);
        }
      }
    } else {
      unwrapped.push(n);
    }
  }
  const layoutProgram2: any = { ...layoutProgram, body: unwrapped };

  // Page body children become the layout's slot content.
  ctx.slotContent = pageProgram.body || [];

  return generateHTML(layoutProgram2, ctx);
}

/**
 * Compile a page wrapped in a FULL layout chain (root -> section -> page).
 * Layouts are given outermost-first. Each layout's `slot { }` receives the
 * content of the next-inner layout; the page's own state is visible to all.
 */
export function generateWithLayoutChain(
  layoutPrograms: Program[],
  pageProgram: Program,
  stateVars?: Record<string, string>,
): string {
  const seedCtx = (ctx: any) => {
    if (stateVars) ctx.stateVars = { ...stateVars };
    for (const dir of pageProgram.directives || []) {
      if (dir.type === "StateDirective") {
        for (const decl of (dir as any).declarations || []) {
          ctx.stateVars[decl.name] = decl.value;
        }
      }
      // `title "{page.title}"` in the canonical layout head -- seeded below
      // with a "TW Page" fallback for pages without a title directive.
    }
  };

  {
    let pageTitle = "TW Page";
    for (const dir of pageProgram.directives || []) {
      if (dir.type === "PageDirective" && (dir as any).key === "title") {
        const t = (dir as any).value;
        if (t != null && String(t) !== "") pageTitle = String(t);
      }
    }
    try { ctx.stateVars["page"] = JSON.stringify({ title: pageTitle }); } catch { /* ignore */ }
  }

  // ONE shared context for all levels: import-driven styles collected while
  // rendering page children or any layout must survive into the final
  // generateHTML call (the outermost layout emits the document).
  const pageCtx: any = createContext("ssr");
  seedCtx(pageCtx);
  // Builtin component imports (import Image from "@tw/optImage") — page first,
  // then layouts as fallback.
  {
    const builtins = collectBuiltinImports(pageProgram);
    for (const lp of layoutPrograms ?? []) {
      for (const [k, spec] of collectBuiltinImports(lp)) {
        if (!builtins.has(k)) builtins.set(k, spec);
      }
    }
    setActiveBuiltinImports(builtins);
  }
  // Client hydration: mark interpolations as live when the page has events
  if (programHasEvents(pageProgram)) {
    pageCtx.interactive = true;
    pageCtx.hasInteractivity = true;
  }
  // Streamed signals (publicSignal/privateSignal) are live by definition:
  // their interpolation spans must ship for the runtime to update them.
  {
    const kinds: Record<string, string> = {};
    for (const dir of pageProgram.directives || []) {
      if (dir.type === "StateDirective") {
        for (const decl of (dir as any).declarations || []) {
          if (decl.signalKind === "public" || decl.signalKind === "private") {
            kinds[decl.name] = decl.signalKind;
            pageCtx.interactive = true;
            pageCtx.hasInteractivity = true;
          }
        }
      }
    }
    pageCtx.signalKinds = kinds;
  }
  // Scoped `.module.tss` styles (docs/scoped-styles.md) must be collected
  // BEFORE the page body renders: the class map rewrites markup class
  // attributes during rendering. (Later layout passes skip already-seen
  // files via the shared ctx, so this cannot double-emit CSS.)
  collectTssImports([pageProgram as any], pageCtx);

  let content = (pageProgram.body || []).map((n: any) => generateNode(n, pageCtx)).join("");

  if (!layoutPrograms || layoutPrograms.length === 0) {
    // No layouts: wrap in a standard document via the page itself.
    return generateHTML(pageProgram, pageCtx);
  }



  // Unwrap helper for `html { body { ... } }` wrappers.
  const unwrap = (prog: Program): any => {
    const unwrapped: ASTNode[] = [];
    for (const n of prog.body || []) {
      const el: any = n;
      if (el.type === "Element" && el.tag === "html") {
        for (const c of el.children || []) {
          const ce: any = c;
          if (ce.type === "Element" && ce.tag === "body") {
            unwrapped.push(...(ce.children || []));
          } else if (ce.type === "Element" && ce.tag === "head") {
            unwrapped.push({ type: "HeadDirective", body: ce.children || [], title: undefined, meta: [], links: [], scripts: [], line: ce.line, col: ce.col });
          } else {
            unwrapped.push(c);
          }
        }
      } else {
        unwrapped.push(n);
      }
    }
    return { ...prog, body: unwrapped } as any;
  };

  // Wrap from innermost to outermost -- all levels share pageCtx so that
  // component/layout style imports accumulate into one document.
  const ctx = pageCtx;
  for (let i = layoutPrograms.length - 1; i >= 0; i--) {
    const prog = unwrap(layoutPrograms[i]);
    (ctx as any).slotHTML = content;
    if (i === 0) {
      // Outermost layout produces the full document (head + body).
      // Import-driven styles from ALL programs (layouts + page):
      // `import "@./style/global.tss"` in a layout applies to every page under it.
      collectTssImports([...layoutPrograms, pageProgram], ctx);
      const out = generateHTML(prog, ctx);
      // A layout WITHOUT a slot { } would silently drop the page content.
      // Fall back to appending it before </body> (same behavior as the
      // render-pipeline's wrapInLayout).
      if (!layoutHasSlot(prog) && content) {
        return /<\/body>/i.test(out)
          ? out.replace(/<\/body>/i, (m: string) => content + m)
          : out + "\n" + content;
      }
      return out;
    }
    const rendered = (prog.body || []).map((n: any) => generateNode(n, ctx)).join("");
    // No slot at this level: keep the child content instead of dropping it.
    content = layoutHasSlot(prog) ? rendered : rendered + content;
  }
  return content;
}

/** Does this layout program mark the child-content slot (slot { } or a
 *  {{children}} / {{slot}} text marker)? Used to decide the no-slot
 *  fallback: page content must never be silently dropped. */
function layoutHasSlot(prog: Program): boolean {
  // `slot { }` (SlotNode) and a literal <slot> element are the compiler-side
  // slot forms; {{children}}/{{slot}} markers belong to the render-pipeline
  // wrapper, not the compiler path.
  const walk = (nodes: any[]): boolean => {
    for (const n of nodes || []) {
      if (!n || typeof n !== "object") continue;
      if (n.type === "SlotNode" || n.type === "Slot") return true;
      if (n.type === "Element" && String(n.tag ?? "").toLowerCase() === "slot") return true;
      if (n.children && walk(n.children)) return true;
    }
    return false;
  };
  return walk(prog.body || []);
}

export function generateVDOM(program: Program, ctx: CodegenContext): string {
  function toVNode(node: ASTNode): any {
    if (node.type === "Element") {
      const el = node as ElementNode;
      return {
        t: el.tag,
        a: el.attrs.reduce((acc, a) => { (acc as any)[a.name] = a.value; return acc; }, {}),
        c: el.children.map(toVNode),
      };
    }
    if (node.type === "Text") {
      return { t: "#text", v: (node as TextNode).value };
    }
    if (node.type === "If") {
      const ifNode = node as IfNode;
      return isTruthy(interpolate(ifNode.condition, ctx.stateVars))
        ? ifNode.body.map(toVNode)
        : ifNode.elseBody.map(toVNode);
    }
    return null;
  }

  const vnodes = program.body.filter(n => n.type !== "HeadDirective").map(toVNode).filter(Boolean);
  return JSON.stringify(vnodes);
}

// --- Helpers ------------------------------------------------------------------

function processDirectives(program: Program, ctx: CodegenContext): void {
  for (const dir of program.directives) {
    if (dir.type === "RenderDirective") {
      const renderDir = dir as RenderDirective;
      ctx.renderMode = renderDir.mode;
      if (renderDir.mode === "interactive") {
        ctx.hasVdom = true;
        ctx.hasInteractivity = true;
      }
    }
    // page { render interactive } -- the render mode rides on the
    // PageDirective options, not a standalone RenderDirective.
    if (dir.type === "PageDirective") {
      const mode = (dir as any).options?.render;
      if (mode === "interactive") {
        ctx.hasVdom = true;
        ctx.hasInteractivity = true;
      }
    }
  }
}

function getDirectiveValue(program: Program, key: string): string | undefined {
  for (const dir of program.directives) {
    if (dir.type === "PageDirective") {
      const pageDir = dir as PageDirective;
      if (pageDir.key === key) return pageDir.value as string;
    }
  }
  return;
}

function addScope(css: string, scopeId: string): string {
  return css.replace(/([.#]?[\w-]+)\s*\{/g, `$1[data-tw-scope="${scopeId}"] {`);
}

function interpolate(expr: string, vars: Record<string, string>): string {
  return expr.replace(/\{([^}]+)\}/g, (_, name) => {
    const key = name.trim();
    return vars[key] ?? "";
  });
}

function isTruthy(val: string): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return lower !== "false" && lower !== "0" && lower !== "" && lower !== "null" && lower !== "undefined";
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}


export function generate(program: Program, stateVars?: Record<string, string>): CodegenResult {
  const startTime = performance.now();
  const ctx = createContext("ssr");
  if (stateVars) ctx.stateVars = stateVars;

  // Process directives
  processDirectives(program, ctx);

  // Process state declarations
  const stateSeed: Record<string, any> = {};
  const streamedSignals: Record<string, string> = {};
  const derivedSpecs: Record<string, string> = {};
  for (const dir of program.directives) {
    if (dir.type === "StateDirective") {
      const stateDir = dir as any;
      for (const decl of stateDir.declarations || []) {
        // serverOnlySignal: never seeded, never rendered, never streamed
        if (decl.signalKind === "serverOnly") continue;
        if (decl.signalKind === "public" || decl.signalKind === "private") {
          streamedSignals[decl.name] = decl.signalKind;
          (ctx as any).interactive = true;
          ctx.hasInteractivity = true;
        }
        // derivedSignal("expr"): named computed state -- spec collected for
        // the client runtime; the initial value evaluates after all plain
        // declarations are known (second pass below).
        if (decl.signalKind === "derived") {
          derivedSpecs[decl.name] = decl.value;
          (ctx as any).interactive = true;
          ctx.hasInteractivity = true;
          continue;
        }
        ctx.stateVars[decl.name] = decl.value;
        // Parse the raw value for the client hydration seed
        let v: any = decl.value;
        try { v = JSON.parse(decl.value); }
        catch {
          try { v = new Function("return (" + decl.value + ")")(); }
          catch { /* keep as string */ }
        }
        stateSeed[decl.name] = v;
      }
    }
  }

  // Second pass: derived initial values evaluate now that all plain state
  // declarations are in ctx.stateVars (order-independent).
  for (const [name, expr] of Object.entries(derivedSpecs)) {
    let v: any = "";
    try {
      const keys = Object.keys(ctx.stateVars);
      v = new Function(...keys, "return (" + expr + ")")(...keys.map((k) => ctx.stateVars[k]));
    } catch { /* dependency missing -- client recomputes on boot */ }
    ctx.stateVars[name] = String(v);
    stateSeed[name] = v;
  }

  const html = generateHTML(program, ctx);
  const css = ctx.inlineStyles.join("\n");
  const js = ctx.inlineScripts.join("\n");

  const metadata: CodegenMetadata = {
    mode: ctx.mode,
    renderTime: performance.now() - startTime,
    nodeCount: 0,
    elementCount: 0,
    componentCount: 0,
    cssSize: css.length,
    jsSize: js.length,
    htmlSize: html.length,
  };

  (ctx as any).signalKinds = streamedSignals;
  return {
    html,
    css,
    js,
    hasVdom: ctx.hasVdom,
    hasInteractivity: ctx.hasInteractivity,
    stateSeed,
    streamedSignals,
    derivedSpecs,
    warnings: [],
    chunks: ctx.chunks,
    hydrationData: JSON.stringify(ctx.hydrationMarkers),
    metadata,
  };
}

// --- HTML Generation ---------------------------------------------------------

