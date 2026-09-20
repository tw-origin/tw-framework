import { createContext } from "./types";
import { TW_GENERATOR_META } from "./version.js";
import { collectBuiltinImports, generateBuiltinTag, generateImageTag, resolveBuiltin } from "./builtin-components";
import { evaluate, isTruthy as evalTruthy } from "../eval";
import { compileTSS, validatePlainCss as _validatePlainCss } from "./tss";
import { compileSCSS } from "./scss";
// Node built-ins are imported statically (not via lazy require) so ESM bundles
// keep working — a bare `require("node:fs")` is undefined inside an ESM bundle
// and the .tss import pipeline would silently produce zero CSS.
import { readFileSync, existsSync } from "node:fs";
import { dirname as _dirname, resolve as _resolve } from "node:path";
/** HTML code generation. */

import { type Program, type ASTNode } from "../ast/nodes";
import { type CodegenContext } from "./types";
import type { ScriptBlock } from "../ast/nodes/types";
import type { ElementNode } from "../ast/nodes/elements";
import type { IfNode } from "../ast/nodes/control";
import type { ForNode } from "../ast/nodes/control";
import type { WhileNode } from "../ast/nodes/control";
import type { ElementDirective } from "../ast/nodes/elements";
import type { PageDirective } from "../ast/nodes/directives";
import type { HeadDirective } from "../ast/nodes/directives";
import type { StyleDecl } from "../ast/nodes/elements";
import type { EventBinding } from "../ast/nodes/elements";
import type { PropertyBinding } from "../ast/nodes/elements";
import type { ComponentNode } from "../ast/nodes/types";
import type { TextNode } from "../ast/nodes/types";
import type { StyleBlock } from "../ast/nodes/types";
import type { TwmBlock } from "../ast/nodes/types";
import type { CommentNode } from "../ast/nodes/types";
import type { FragmentNode } from "../ast/nodes/types";
import type { SlotNode } from "../ast/nodes/types";
import type { HydrationMarker } from "./types";

// --- HTML Escaping --------------------------------------------------------------

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

/**
 * URL-bearing attributes must never receive a `javascript:` (or `data:text/html`)
 * scheme from interpolated state -- neutralize them at codegen time.
 */
function sanitizeUrlAttr(name: string, value: string): string {
  const URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href", "poster", "background"]);
  if (!URL_ATTRS.has(name.toLowerCase())) return value;
  const trimmed = String(value).trim().toLowerCase().replace(/[\s\0]/g, "");
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:text/html") || trimmed.startsWith("vbscript:")) {
    return "#";
  }
  return value;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const BOOLEAN_ATTRS = new Set([
  "disabled", "checked", "selected", "readonly", "required", "async",
  "autofocus", "autoplay", "controls", "defer", "hidden", "ismap",
  "loop", "multiple", "muted", "nomodule", "novalidate", "open",
  "playsinline", "reversed", "scoped", "truespeed", "typemustmatch",
  "visible", "default", "formnovalidate", "itemscope",
]);

function getDirectiveValue(program: Program, key: string): string | undefined {
  for (const dir of program.directives) {
    if (dir.type === "PageDirective") {
      const pageDir = dir as PageDirective;
      if (pageDir.key === key) return pageDir.value as string;
      // Also check options (e.g. description in: page { title "X" description "Y" })
      if (pageDir.options && pageDir.options[key]) return String(pageDir.options[key]);
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
    // Bare identifier: simple lookup (missing -> "").
    if (/^[a-zA-Z_$][\w$]*$/.test(key)) {
      return vars[key] ?? "";
    }
    // Expression (e.g. `index + 1`, `count > 5`): use the evaluator.
    const val = evaluate(key, vars);
    return val === null ? "" : val;
  });
}

function isTruthy(val: string): boolean {
  return evalTruthy(val);
}



/**
 * CSS output pipeline (production model):
 *   .tss / .css / .module.tss / .module.css imports and <style> blocks are
 *   captured per ROUTE during build/dev, deduplicated by content, split into
 *   a shared `common.<hash>.css` + per-route `<route>.<hash>.css` files and
 *   linked from <head>. Small stylesheets are inlined as critical CSS.
 *   Without an active capture (bare compileSync calls, unit tests), the
 *   styles are rendered inline as before.
 */
const CSS_CHUNKS = new Map<string, string>();          // chunkId -> css (content-addressed)
const CSS_ROUTE_CHUNKS = new Map<string, Set<string>>(); // route -> chunkIds used
const CSS_CAPTURE = { active: false, route: "" };

/** Begin capturing every stylesheet touched by the next compiles under `route`. */
export function beginCssRouteCapture(route: string): void {
  CSS_CAPTURE.active = true;
  CSS_CAPTURE.route = route;
  if (!CSS_ROUTE_CHUNKS.has(route)) CSS_ROUTE_CHUNKS.set(route, new Set());
}
export function endCssRouteCapture(): void {
  CSS_CAPTURE.active = false;
  CSS_CAPTURE.route = "";
}
/** Is a route capture currently active? */
export function isCssCaptureActive(): boolean {
  return CSS_CAPTURE.active;
}
/** Record a stylesheet chunk (content-deduped) under the active route. */
export function recordCssChunk(css: string): void {
  if (!css || !CSS_CAPTURE.active) return;
  const id = cssChunkId(css);
  if (!CSS_CHUNKS.has(id)) CSS_CHUNKS.set(id, css);
  CSS_ROUTE_CHUNKS.get(CSS_CAPTURE.route)?.add(id);
}
/** All captured chunk css by chunk id (content-addressed). */
export function getCssChunks(): Map<string, string> {
  return new Map(CSS_CHUNKS);
}

/** Routes captured so far -> ordered chunk ids. */
export function getCapturedCssRoutes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [route, ids] of CSS_ROUTE_CHUNKS) out.set(route, [...ids]);
  return out;
}
/** Reset all captured css state (used between builds). */
export function clearCssCapture(): void {
  CSS_CHUNKS.clear();
  CSS_ROUTE_CHUNKS.clear();
  CSS_CAPTURE.active = false;
  CSS_CAPTURE.route = "";
}
/** Stable 8-hex content hash (same css in -> same hash out). */
function cssChunkId(css: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < css.length; i++) {
    h1 = ((h1 ^ css.charCodeAt(i)) * 16777619) | 0;
    h2 = ((h2 + css.charCodeAt(i) * (i + 7)) * 2654435761) | 0;
  }
  const v = ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(8, "0");
  return v.slice(0, 8);
}
export { cssChunkId as hashCss };

/**
 * Resolve `import "@./style/x.tss"` side-effect imports for the given
 * programs: read each .tss file (relative to the importing .tw file),
 * compile it to CSS. With a route capture active the css is recorded as a
 * stylesheet chunk; otherwise it is added to the page's inline styles.
 */

export function collectTssImports(programs: Program[], ctx: CodegenContext): void {
  try {
    if (!(ctx as any).tssSeen) (ctx as any).tssSeen = new Set<string>();
    const seen: Set<string> = (ctx as any).tssSeen;
    for (const program of programs) {
      const base = (program as any).filePath;
      if (!base) continue;
      for (const dir of (program as any).directives || []) {
        if (dir.type === "ImportDirective" && typeof dir.source === "string" && (/\.tss$/.test(dir.source) || /\.css$/.test(dir.source) || /\.scss$/.test(dir.source))) {
          const rel = dir.source.replace(/^@/, "").replace(/^\.?\//, "");
          // `@./` is a PROJECT-ROOT alias (style/ and components/ live at the
          // root, while the importing .tw may be nested deep in home/).
          // Walk up the ancestors of the importing file to find the first match.
          const abs = resolveTssPath(_dirname(base), rel);
          if (!abs) continue;
          if (seen.has(abs)) continue;
          seen.add(abs);
          try {
            const src = readFileSync(abs, "utf-8");
            const css = /\.scss$/.test(abs) ? compileSCSS(src)
              : (/\.tss$/.test(abs) ? compileTSS(src) : _validatePlainCss(src, abs));
            if (css) {
              if (CSS_CAPTURE.active) recordCssChunk(css);
              else ctx.inlineStyles.push(css);
            }
          } catch (e: any) {
            if (e && typeof e.message === "string" && e.message.startsWith("TW301")) throw e;
            /* missing .tss file -- skip */
          }
        }
      }
    }
  } catch (e: any) {
    if (e && typeof e.message === "string" && e.message.startsWith("TW301")) throw e;
    /* fs unavailable */
  }
}

/**
 * Resolve a `@./`-style import path: walk up from the importing file's
 * directory toward the filesystem root, returning the first existing match
 * (project-root style/ and components/ are found this way).
 */
function resolveTssPath(fromDir: string, rel: string): string | null {
  try {
    let cur = fromDir;
    for (let i = 0; i < 12; i++) {
      const cand = _resolve(cur, rel);
      if (existsSync(cand)) return cand;
      const parent = _dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  } catch { /* ignore */ }
  return null;
}

export function generateHTML(program: Program, ctx?: CodegenContext): string {
  if (!ctx) {
    ctx = createContext();
  }
  const parts: string[] = [];

  // Live hydration: if the program contains ANY event bindings (on:click ...)
  // or the page declares `render interactive`, mark interpolations with
  // data-tw-i spans so the client runtime can re-evaluate them.
  if (!ctx.interactive && (programHasEvents(program) || programDeclaresInteractive(program))) {
    ctx.interactive = true;
    ctx.hasInteractivity = true;
  }

  // Import-driven styles: import "@./style/global.tss"
  collectTssImports([program], ctx);

  // DOCTYPE
  parts.push("<!DOCTYPE html>");

  // HTML root
  const lang = getDirectiveValue(program, "lang") ?? "en";
  parts.push(`<html lang="${lang}">`);

  // BODY FIRST: components resolved while rendering the body push their
  // import-driven styles (import "@./style/header.tss") into ctx.inlineStyles
  // -- the head must be assembled AFTER the body so those styles are included.
  const bodyHTML = generateBody(program, ctx);

  // HEAD (now includes all inline styles)
  parts.push(generateHead(program, ctx));

  // BODY
  parts.push(bodyHTML);

  parts.push("</html>");

  return parts.join("\n");
}

function generateHead(program: Program, ctx: CodegenContext): string {
  const parts: string[] = ["<head>"];

  // Head directive content (HeadDirective lives in program.directives when
  // parsed at the top level, or in program.body when nested in a page body).
  // Canonical layouts define their own <head> (charset/viewport/title) --
  // render it first so we only add defaults that are actually missing.
  const headSources: ASTNode[] = [...docNodes(program), ...((program as any).directives || [])];
  let headChildren = "";
  for (const node of headSources) {
    if (node.type === "HeadDirective") {
      ctx.inHead = true;
      for (const child of (node as HeadDirective).body) {
        headChildren += "  " + generateNode(child, ctx) + "\n";
      }
      ctx.inHead = false;
    }
  }

  // Title: page directive value wins; default only when head has none
  const title = getDirectiveValue(program, "title");
  const hasTitleInHead = /<title[\s>]/.test(headChildren);
  if (!hasTitleInHead) {
    parts.push(`  <title>${escapeHTML(title ?? "TW Page")}</title>`);
  }

  // Meta defaults: only if the head block didn't provide them
  if (!/charset/i.test(headChildren)) {
    parts.push('  <meta charset="UTF-8">');
  }
  if (!/name="viewport"/i.test(headChildren)) {
    parts.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  }

  // Generator meta: identifies the technology that built the page
  // (industry convention -- Astro, Gatsby, WordPress emit the same).
  if (!/name="generator"/i.test(headChildren)) {
    parts.push(`  ${TW_GENERATOR_META}`);
  }

  // Description from page directive
  const description = getDirectiveValue(program, "description");
  if (description) {
    parts.push(`  <meta name="description" content="${escapeHTML(description)}">`);
  }

  if (headChildren) parts.push(headChildren);

  // Styles: with a route capture active, scoped <style> blocks become css
  // chunks of the route (build/dev write them out as .css assets and link
  // them, inlining only small critical stylesheets). Bare compiles keep the
  // classic merged inline <style> render.
  if (CSS_CAPTURE.active) {
    for (const st of ctx.inlineStyles || []) recordCssChunk(st);
  } else if (ctx.inlineStyles && ctx.inlineStyles.length > 0) {
    parts.push("  <style>");
    parts.push(ctx.inlineStyles.join("\n"));
    parts.push("  </style>");
  }

  // Hydration script
  if (ctx.hasVdom || ctx.hasInteractivity) {
    parts.push('  <script type="application/json" id="__TW_HYDRATION__">');
    // Script content is raw text: entity-escaping would leave literal
    // `"` in the JSON and break JSON.parse. Escape only `<` (as \u003c)
    // so a value cannot terminate the script block with `</script>`.
    parts.push(JSON.stringify(ctx.hydrationMarkers).replace(/</g, "\\u003c"));
    parts.push("  </script>");
  }

  // Suspense client runtime: fallback -> content swap (docs/90). Static
  // and SSR pages resolve immediately from the hidden template; `render
  // ppr` boundaries carry data-tw-ppr and fetch fresh content per request.
  if ((ctx as any).hasSuspense) {
    parts.push('  <script>');
    parts.push(SUSPENSE_BOOT_RUNTIME);
    parts.push("  </script>");
  }

  parts.push("</head>");
  return parts.join("\n");
}

/**
 * Effective document children: unwrap a root `html { ... }` wrapper so its
 * head/body are treated as the document's own. Without this the compiled
 * output nests a second <html><body> inside the body, and head content
 * (title/meta) never reaches generateHead. The layout-chain renderer
 * (generateWithLayoutChain) already unwraps; this brings the bare
 * generateHTML path to the same behavior.
 */
function docNodes(program: Program): ASTNode[] {
  const body: ASTNode[] = (program.body ?? []) as ASTNode[];
  const rootHtml = body.find(n => n && (n as any).type === "Element" && (n as any).tag === "html");
  if (!rootHtml) return body;
  const inner: ASTNode[] = ((rootHtml as any).children ?? []) as ASTNode[];
  return [...inner, ...body.filter(n => n !== rootHtml)];
}

/** Builtin component imports (import X from "@tw/optImage") bound by the page
 *  currently being generated — populated by generateBody / layout chain. */
let activeBuiltinImports: Map<string, string> = new Map();

/** Bind the builtin imports of the program about to be rendered. */
export function setActiveBuiltinImports(m: Map<string, string>): void {
  activeBuiltinImports = m;
}

function generateBody(program: Program, ctx: CodegenContext): string {
  activeBuiltinImports = collectBuiltinImports(program);
  const parts: string[] = ["<body>"];

  for (const node of docNodes(program)) {
    if (node.type === "HeadDirective") continue;
    // head elements render through generateHead, not the body
    if ((node as any).type === "Element" && (node as any).tag === "head") continue;
    // the document body element: render its children (the outer <body> is
    // emitted here), keeping any attributes it carries
    if ((node as any).type === "Element" && (node as any).tag === "body") {
      const el = node as ElementNode;
      for (const a of el.attrs ?? []) {
        parts[0] += ` ${a.name}="${escapeHTML(String(a.value ?? ""))}"`;
      }
      for (const child of el.children ?? []) {
        const h = generateNode(child, ctx);
        if (h) parts.push(h);
      }
      continue;
    }
    let html = generateNode(node, ctx);
    if (html) parts.push(html);
  }

  // Inline scripts
  for (const script of ctx.inlineScripts) {
    if (script.trim()) {
      parts.push(`<script>${script}</script>`);
    }
  }

  parts.push("</body>");
  return parts.join("\n");
}

// --- Node Generation ----------------------------------------------------------

export function generateNode(node: ASTNode, ctx: CodegenContext): string {
  if (!node) return "";

  switch (node.type) {
    case "Element": {
      const el = node as ElementNode;
      // Capitalized tags in the indented syntax (e.g. `Header { }`) are
      // component usages -- when the component was registered (via the
      // components/ scan), render it from the registry instead of emitting
      // a raw unknown element.
      // Suspense is a framework builtin -- no import required (docs/90).
      // `Suspense { fallback div.loading { "..." } ...content... }` compiles
      // to a fallback div + a hidden content template the client runtime
      // swaps in (immediately for static, streamed for `render stream`,
      // fetched per-request for `render ppr`).
      if (el.tag === "Suspense") return generateSuspense(el, ctx);
      if (/^[A-Z]/.test(el.tag) && componentRegistry.has(el.tag)) {
        const comp = {
          ...el,
          type: "Component",
          name: el.tag,
          props: el.attrs.map(a => ({ name: a.name, value: a.value, line: a.line, col: a.col })),
        } as unknown as ComponentNode;
        return generateComponent(comp, ctx);
      }
      return generateElement(el, ctx);
    }
    case "Text":         return generateText(node as TextNode, ctx);
    case "Component":    return generateComponent(node as ComponentNode, ctx);
    case "If":           return generateIf(node as IfNode, ctx);
    case "Switch":       return generateSwitch(node, ctx);
    case "Try":          return generateTry(node, ctx);
    case "For":          return generateFor(node as ForNode, ctx);
    case "While":        return generateWhile(node as WhileNode, ctx);
    case "ScriptBlock":  return generateScriptBlock(node as ScriptBlock, ctx);
    case "StyleBlock":   return generateStyleBlock(node as StyleBlock, ctx);
    case "TwmBlock":     return generateTwmBlock(node as TwmBlock, ctx);
    case "Comment":      return generateComment(node as CommentNode);
    case "Fragment":     return generateFragment(node as FragmentNode, ctx);
    case "Slot":         return generateSlot(node as SlotNode, ctx);
    case "Doctype":      return "";
    default:             return "";
  }
}

/**
 * Client runtime for Suspense boundaries (~700 bytes). __TW_RESOLVE__ swaps
 * a fallback for content: given html (streamed chunk / PPR fragment) it
 * replaces the fallback node; without html it uses the hidden template the
 * page already carries. Boundaries marked data-tw-ppr fetch fresh content
 * from /_tw/ppr instead of resolving from the shipped template.
 */
const SUSPENSE_BOOT_RUNTIME = [
  "(function(){",
  "  if (window.__TW_SUSPENSE_BOOTED__) return; window.__TW_SUSPENSE_BOOTED__ = true;",
  "  window.__TW_RESOLVE__ = function(id, html) {",
  "    var box = document.querySelector('[data-tw-suspense=\"' + id + '\"]');",
  "    if (!box) return;",
  "    var fb = box.querySelector('[data-tw-suspense-fallback=\"' + id + '\"]');",
  "    var tpl = box.querySelector('template[data-tw-content=\"' + id + '\"]');",
  "    if (html == null) { if (tpl) html = tpl.innerHTML; else return; }",
  "    if (fb) fb.outerHTML = html; else box.insertAdjacentHTML('afterbegin', html);",
  "    if (tpl) tpl.remove();",
  "  };",
  "  function boot() {",
  "    document.querySelectorAll('[data-tw-suspense]').forEach(function(box) {",
  "      var id = box.getAttribute('data-tw-suspense');",
  "      if (box.hasAttribute('data-tw-ppr')) {",
  "        fetch('/_tw/ppr?path=' + encodeURIComponent(location.pathname) + '&id=' + encodeURIComponent(id))",
  "          .then(function(r) { return r.text(); })",
  "          .then(function(html) { if (html) window.__TW_RESOLVE__(id, html); })",
  "          .catch(function() {});",
  "      } else {",
  "        window.__TW_RESOLVE__(id);",
  "      }",
  "    });",
  "  }",
  "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);",
  "  else boot();",
  "})();",
].join("\n");

/** Suspense boundaries emitted so far — reset by compileSync so ids stay deterministic per file. */
export let suspenseCounter = 0;
export function resetSuspenseCounter(): void { suspenseCounter = 0; }

function generateSuspense(el: ElementNode, ctx: CodegenContext): string {
  (ctx as any).hasSuspense = true;
  const children: ASTNode[] = el.children ?? [];
  let fallbackHTML = "";
  let contentChildren: ASTNode[] = children;

  // Documented shape: a bare `fallback` word followed by the fallback element
  // (parser yields a Text node "fallback"), then the content children.
  const markerIdx = children.findIndex(
    (c: any) => c.type === "Text" && String(c.value ?? "").trim() === "fallback",
  );
  if (markerIdx >= 0) {
    const fallbackEl = children[markerIdx + 1];
    if (fallbackEl && (fallbackEl as any).type === "Element") {
      fallbackHTML = generateNode(fallbackEl, ctx);
      contentChildren = [
        ...children.slice(0, markerIdx),
        ...children.slice(markerIdx + 2),
      ];
    } else {
      // `fallback` marker with no element after it -- drop the bare word only
      contentChildren = children.filter((_, i) => i !== markerIdx);
    }
  } else {
    // Shape 2: a child element literally tagged `fallback`
    const fbEl = children.find((c: any) => c.type === "Element" && c.tag === "fallback");
    if (fbEl) {
      fallbackHTML = ((fbEl as any).children ?? []).map((c: any) => generateNode(c, ctx)).join("");
      contentChildren = children.filter((c: any) => !(c.type === "Element" && c.tag === "fallback"));
    }
  }
  if (!fallbackHTML) fallbackHTML = '<div data-tw-suspense-spinner aria-busy="true">Loading…</div>';

  const contentHTML = contentChildren.map((c: any) => generateNode(c, ctx)).join("");
  // Deterministic id from boundary content: `render ppr` hole fills match
  // the serve-time re-render to the id the build-time shell shipped
  // (random ids would never line up across the two compiles).
  let h = 0;
  const key = fallbackHTML + "|" + contentHTML;
  for (let i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) | 0;
  const id = "tw-s-" + (h >>> 0).toString(36) + "-" + ++suspenseCounter;
  return [
    `<div data-tw-suspense="${id}">`,
    `  <div data-tw-suspense-fallback="${id}">${fallbackHTML}</div>`,
    `  <template data-tw-content="${id}" hidden>${contentHTML}</template>`,
    `</div>`,
  ].join("\n");
}

function generateElement(el: ElementNode, ctx: CodegenContext): string {
  const tag = el.tag;
  const voidTag = VOID_TAGS.has(tag.toLowerCase());

  // Builtin framework components (import optImage from "@tw/optImage",
  // import RouterLink from "@tw/RouterLink", ...). With the text shorthand
  // (RouterLink "Home" { href ... }) props land in el.attrs; without it the
  // body parses as child elements — collect both into one prop bag, plus
  // the leftover text as content.
  {
    const builtinSpec = resolveBuiltin(tag, activeBuiltinImports);
    if (builtinSpec) {
      const props: Record<string, string> = {};
      let text = "";
      for (const attr of el.attrs ?? []) {
        props[attr.name] = attr.value === true ? "true" : interpolate(String(attr.value), ctx.stateVars);
      }
      for (const c of el.children ?? []) {
        const ch: any = c;
        if (ch.type === "Element") {
          if ((ch.children?.length ?? 0) === 1 && ch.children[0].type === "Text") {
            props[ch.tag] = interpolate(String(ch.children[0].value ?? ""), ctx.stateVars);
          } else if ((ch.children?.length ?? 0) === 0) {
            props[ch.tag] = "true";
          }
        } else if (ch.type === "Text" && typeof ch.value === "string") {
          // Bare word (e.g. `priority`, `prefetch`) is a boolean prop for
          // prop-style components; it is also kept as text content for
          // text-style components (RouterLink "label").
          text += ch.value;
          const word = ch.value.trim();
          if (word && !/\s/.test(word) && props[word] === undefined) {
            props[word] = "true";
          }
        }
      }
      const out = generateBuiltinTag(builtinSpec, props, text.trim());
      if (out !== null) return out;
    }
  }

  // <img src="..." optimize /> — the attribute form of the Image component
  if (tag.toLowerCase() === "img" && el.attrs.some((a) => a.name === "tw-optimize" || a.name === "optimize")) {
    const get = (n: string): string | undefined => {
      const a = el.attrs.find((x) => x.name === n);
      if (!a) return undefined;
      if (a.value === true) return "true";
      return interpolate(String(a.value), ctx.stateVars);
    };
    return generateImageTag({
      src: get("src") ?? "",
      width: get("width") ?? "0",
      height: get("height") ?? "0",
      quality: get("quality") ?? "0",
      priority: get("priority") ?? "",
      placeholder: get("placeholder") ?? "",
      alt: get("alt") ?? "",
      class: get("class") ?? "",
      id: get("id") ?? "",
    });
  }

  // Build attributes
  let attrStr = renderAttrs(el, ctx);
  const styleStr = renderStyles(el.styles);
  const eventStr = renderEvents(el.events, ctx);
  const bindStr = renderBindings(el.bindings, ctx);
  const dirStr = renderDirectives(el.directives, ctx);

  const allAttrs = [attrStr, styleStr, eventStr, bindStr, dirStr].filter(s => s.length > 0).join(" ");
  let attrPrefix = allAttrs ? " " + allAttrs : "";

  // Hydration marker
  if (ctx.mode === "ssr" && (el.events.length > 0 || el.bindings.length > 0 || el.directives.length > 0)) {
    ctx.hasInteractivity = true;
    const marker: HydrationMarker = {
      id: `el_${ctx.hydrationMarkers.length}`,
      path: `${el.tag}:${el.line}:${el.col}`,
      type: "element",
    };
    ctx.hydrationMarkers.push(marker);
    attrPrefix += ` data-tw-hydrate="${marker.id}"`;
  }

  if (voidTag) {
    return `<${tag}${attrPrefix}>`;
  }

  if (el.children.length === 0 && el.selfClosing) {
    return `<${tag}${attrPrefix}></${tag}>`;
  }

  const childrenHTML = el.children.map(c => generateNode(c, ctx)).join("");
  return `<${tag}${attrPrefix}>${childrenHTML}</${tag}>`;
}

function renderAttrs(el: ElementNode, ctx: CodegenContext): string {
  const parts: string[] = [];
  for (const attr of el.attrs) {
    if (attr.value === true || BOOLEAN_ATTRS.has(attr.name)) {
      parts.push(attr.name);
    } else if (attr.isInterpolated) {
      const val = interpolate(attr.value as string, ctx.stateVars);
      parts.push(`${attr.name}="${escapeAttr(val)}"`);
    } else if (typeof attr.value === "string" && !attr.name.startsWith("data-tw-event") && /\{[^}]+\}/.test(attr.value) && Object.keys(ctx.stateVars).length > 0) {
      // Values like href "/blog/{slug}" weren't flagged as interpolated by
      // the parser -- interpolate them anyway.
      const val = interpolate(attr.value, ctx.stateVars);
      parts.push(`${attr.name}="${escapeAttr(sanitizeUrlAttr(attr.name, val))}"`);
    } else {
      parts.push(`${attr.name}="${escapeAttr(sanitizeUrlAttr(attr.name, attr.value as string))}"`);
    }
  }
  return parts.join(" ");
}

function renderStyles(styles: StyleDecl[]): string {
  if (styles.length === 0) return "";
  const parts = styles.map(s => `${s.property}: ${s.value}${s.important ? " !important" : ""}`);
  return `style="${parts.join("; ")}"`;
}

function renderEvents(events: EventBinding[], ctx: CodegenContext): string {
  if (events.length === 0) return "";
  const parts: string[] = [];
  for (const event of events) {
    // In SSR mode, serialize as data attributes for hydration
    parts.push(`data-tw-event-${event.event}="${event.handler}"`);
    if (event.preventDefault) parts.push(`data-tw-event-${event.event}-prevent="true"`);
    if (event.stopPropagation) parts.push(`data-tw-event-${event.event}-stop="true"`);
  }
  return parts.join(" ");
}

function renderBindings(bindings: PropertyBinding[], ctx: CodegenContext): string {
  if (bindings.length === 0) return "";
  const parts: string[] = [];
  for (const binding of bindings) {
    parts.push(`data-tw-bind-${binding.property}="${binding.expression}"`);
  }
  return parts.join(" ");
}

function renderDirectives(directives: ElementDirective[], ctx: CodegenContext): string {
  if (directives.length === 0) return "";
  const parts: string[] = [];
  for (const dir of directives) {
    const val = dir.value || dir.condition || dir.varName || "";
    parts.push(`data-tw-${dir.kind}="${val}"`);
  }
  return parts.join(" ");
}

/** Does the page directive declare `render interactive`? */
function programDeclaresInteractive(program: any): boolean {
  for (const dir of program?.directives ?? []) {
    const key = String((dir as any).key ?? (dir as any).name ?? "").toLowerCase();
    const val = String((dir as any).value ?? (dir as any).mode ?? "").toLowerCase();
    if ((dir.type === "PageDirective" && val === "interactive") || (key === "render" && val === "interactive")) {
      return true;
    }
  }
  return false;
}

/** Does any node in this program carry an event binding (on:click ...)? */
export function programHasEvents(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node.events) && node.events.length > 0) return true;
  // transformSSRAttributes converts on:click bindings into data-tw-event-*
  // attributes -- detect those too.
  if (Array.isArray(node.attrs)) {
    for (const a of node.attrs) {
      if (a && typeof a.name === "string" && a.name.startsWith("data-tw-event")) return true;
    }
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) if (programHasEvents(c)) return true;
  }
  if (Array.isArray(node.body)) {
    for (const c of node.body) if (programHasEvents(c)) return true;
  }
  if (Array.isArray(node.statements)) {
    for (const c of node.statements) if (programHasEvents(c)) return true;
  }
  if (node.block && typeof node.block === "object") return programHasEvents(node.block);
  return false;
}

/**
 * Streamed-signal bindings: a public/private signal's interpolation span
 * carries data-tw-s="name" so the signal stream targets it directly
 * (docs/signal-streaming.md). serverOnly signals never get one.
 */
function dataTwSFor(expr: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr.trim()) ? ` data-tw-s="${escapeHTML(expr.trim())}"` : "";
}

/** Wrap each {expr} in a data-tw-i span for the client runtime. */
function wrapInterpolations(rendered: string, raw: string): string {
  if (!ctx_global_interactive) return rendered;
  // Split the RAW source on {expr} placeholders and re-emit each piece:
  // literal parts stay HTML-escaped, expr parts get live spans.
  const segs = raw.split(/(\{[^{}]+\})/g);
  if (segs.length <= 1) return rendered;
  let out = "";
  for (const seg of segs) {
    if (/^\{[^{}]+\}$/.test(seg)) {
      const expr = seg.slice(1, -1);
      // <title> is an RCDATA element: markup inside it is parsed as text,
      // so live spans are invalid there. Emit plain resolved text instead.
      if (ctx_global_inhead) {
        out += escapeHTML(interpolate(seg, lastStateVars));
        continue;
      }
      out += (`<span data-tw-i="${escapeHTML(expr)}"${dataTwSFor(expr)}>${escapeHTML(interpolate(seg, lastStateVars))}</span>`);
    } else if (seg) {
      out += escapeHTML(seg);
    }
  }
  return out;
}
let ctx_global_interactive = false;
let ctx_global_inhead = false;
let lastStateVars: Record<string, string> = {};

function generateText(text: TextNode, ctx: CodegenContext): string {
  ctx_global_interactive = ctx.interactive === true;
  ctx_global_inhead = ctx.inHead === true;
  lastStateVars = ctx.stateVars;
  if (text.isInterpolated) {
    // The parser already strips the surrounding `{ }` for a pure-interpolated
    // Text node (text.value is the bare expression, e.g. "count"), but
    // interpolate() expects brace-wrapped input (it's designed for strings
    // that mix literal text and `{expr}` placeholders, like attribute
    // values) -- re-wrap it so the existing regex actually matches.
    if (ctx.interactive && ctx.inHead !== true) {
      return (`<span data-tw-i="${escapeHTML(text.value)}"${dataTwSFor(text.value)}>${escapeHTML(interpolate(`{${text.value}}`, ctx.stateVars))}</span>`);
    }
    return escapeHTML(interpolate(`{${text.value}}`, ctx.stateVars));
  }
  // Mixed text like "Hello {name}" (isInterpolated=false) still contains
  // `{expr}` placeholders -- run it through interpolate() as well. Plain
  // text without braces is left untouched by the regex.
  if (text.value && /\{[^}]+\}/.test(text.value) && Object.keys(ctx.stateVars).length > 0) {
    if (ctx.interactive) {
      return wrapInterpolations(interpolate(text.value, ctx.stateVars), text.value);
    }
    return escapeHTML(interpolate(text.value, ctx.stateVars));
  }
  return escapeHTML(text.value);
}

// Component registry -- populated when components/ directory is scanned
const componentRegistry = new Map<string, Program>();

export function registerComponentTemplate(name: string, program: Program): void {
  componentRegistry.set(name, program);
}

export function clearComponentRegistry(): void {
  componentRegistry.clear();
}

function generateComponent(comp: ComponentNode, ctx: CodegenContext): string {
  if (ctx.componentStack.includes(comp.name)) {
    return `<!-- Circular component: ${comp.name} -->`;
  }

  // Builtin framework components (import X from "@tw/optImage") compile to
  // plain optimized HTML — nothing from the import reaches the browser.
  const compName: string = comp.tag ?? comp.name ?? "";
  const builtinSpec = resolveBuiltin(compName, activeBuiltinImports);
  if (builtinSpec) {
    const props: Record<string, string> = {};
    for (const prop of comp.props) {
      if (prop.value === undefined || prop.value === true) props[prop.name] = "true";
      else props[prop.name] = interpolate(String(prop.value), ctx.stateVars);
    }
    const text = (comp.children ?? [])
      .map((c: any) => (c.type === "Text" ? String(c.value ?? "") : ""))
      .join("")
      .trim();
    const out = generateBuiltinTag(builtinSpec, props, text);
    if (out !== null) return out;
  }

  ctx.componentStack.push(comp.name);

  // Resolve props into stateVars
  const savedStateVars = { ...ctx.stateVars };
  for (const prop of comp.props) {
    if (typeof prop.value === "string") {
      const resolved = interpolate(prop.value, ctx.stateVars);
      ctx.stateVars[prop.name] = resolved;
    }
  }

  // Check if component is registered (compiled from components/*.tw)
  const componentProgram = componentRegistry.get(comp.name);
  let childrenHTML = "";

  if (componentProgram) {
    // Self-styling components: import "@./style/header.tss" inside a component
    collectTssImports([componentProgram as any], ctx);
    // Classify usage-site children: `label "Save"` (bare IDENT + single text
    // child) is a PROP when the component body references `{label}`; all
    // other children are slot content.
    const serialized = JSON.stringify(componentProgram);
    const slotChildren: ASTNode[] = [];
    for (const child of comp.children || []) {
      const c: any = child;
      if (
        c.type === "Element" && (c.attrs?.length ?? 0) === 0 &&
        c.children?.length === 1 && c.children[0].type === "Text" &&
        serialized.includes(`{${c.tag}}`)
      ) {
        ctx.stateVars[c.tag] = interpolate(String(c.children[0].value ?? ""), ctx.stateVars);
        continue;
      }
      slotChildren.push(child);
    }

    // Render the component's own body
    const compSavedInHead = ctx.inHead;
    ctx.inHead = false;
    const savedSlot = (ctx as any).slotContent;
    (ctx as any).slotContent = slotChildren;
    for (const node of componentProgram.body) {
      if (node.type === "HeadDirective") continue;
      const html = generateNode(node, ctx);
      if (html) childrenHTML += html;
    }
    (ctx as any).slotContent = savedSlot;
    ctx.inHead = compSavedInHead;
  } else {
    // Fallback: render children (inline mode)
    childrenHTML = comp.children.map(c => generateNode(c, ctx)).join("");
  }

  // Restore stateVars
  ctx.stateVars = savedStateVars;
  ctx.componentStack.pop();

  return childrenHTML;
}

function generateIf(node: IfNode, ctx: CodegenContext): string {
  // Evaluate the full condition expression (e.g. `status == "ready"`),
  // not just interpolate it -- a bare `status == "x"` string would always
  // be truthy otherwise.
  const condVal = evaluate(node.condition, ctx.stateVars);
  const ifHtml = node.body.map(c => generateNode(c, ctx)).join("");
  const elseHtml = node.elseBody.map(c => generateNode(c, ctx)).join("");
  if (ctx.interactive) {
    // Live: BOTH branches stay in the DOM (wrong one starts hidden via
    // inline style); the client runtime toggles [data-tw-if]/[data-tw-not].
    const cond = String(node.condition ?? "").replace(/"/g, "&#34;");
    const ifShown = isTruthy(condVal);
    let out = `<tw-if data-tw-if="${cond}"${ifShown ? "" : " style=\"display:none\""}>${ifHtml}</tw-if>`;
    out += `<tw-if data-tw-not="${cond}"${ifShown ? " style=\"display:none\"" : ""}>${elseHtml}</tw-if>`;
    return out;
  }
  if (isTruthy(condVal)) {
    return ifHtml;
  }
  return elseHtml;
}

function generateSwitch(node: any, ctx: CodegenContext): string {
  const subject = evaluate(node.expression, ctx.stateVars);
  for (const c of node.cases || []) {
    let val = String(c.value ?? "");
    // Parser stores case values without quotes -- strip them if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val === subject) {
      return (c.body || []).map((n: any) => generateNode(n, ctx)).join("");
    }
  }
  return (node.defaultBody || []).map((n: any) => generateNode(n, ctx)).join("");
}

function generateTry(node: any, ctx: CodegenContext): string {
  try {
    return (node.body || []).map(c => generateNode(c, ctx)).join("");
  } catch {
    return (node.catchBody || []).map(c => generateNode(c, ctx)).join("");
  }
}

function generateFor(node: ForNode, ctx: CodegenContext): string {
  let html = "";
  let firstItemHtml = "";
  const iterableStr = interpolate(node.iterable, ctx.stateVars);

  let items: any[] = [];
  try {
    const parsed = JSON.parse(iterableStr);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    if (ctx.stateVars[node.iterable]) {
      try {
        const parsed = JSON.parse(ctx.stateVars[node.iterable]);
        if (Array.isArray(parsed)) items = parsed;
      } catch { /* ignored */ }
    }
  }

  for (let i = 0; i < items.length; i++) {
    const childCtx = { ...ctx };
    childCtx.stateVars = { ...ctx.stateVars };
    // Objects are stored as JSON so `evaluate()` member access (`post.title`)
    // can JSON.parse them back; scalars stay as plain strings.
    const raw = items[i];
    childCtx.stateVars[node.varName] = (typeof raw === "object" && raw !== null) ? JSON.stringify(raw) : String(raw);
    if (node.indexName) childCtx.stateVars[node.indexName] = String(i);
    const itemHtml = node.body.map(c => generateNode(c, childCtx)).join("");
    if (i === 0) firstItemHtml = itemHtml;
    html += itemHtml;
  }

  // Live list rendering: wrap in <tw-for> with the first item as template
  // so the client runtime can re-render when the array changes.
  if (ctx.interactive) {
    let tplSource = firstItemHtml;
    if (items.length === 0) {
      // An initially-empty list still ships its <tw-for> anchor -- the
      // client runtime needs it to render items once the array fills. Build
      // the template from a dummy item: span text is re-evaluated per item
      // from the data-tw-i expressions, so dummy text never reaches the DOM.
      const childCtx = { ...ctx };
      childCtx.stateVars = { ...ctx.stateVars };
      childCtx.stateVars[node.varName] = "{}";
      if (node.indexName) childCtx.stateVars[node.indexName] = "0";
      tplSource = node.body.map(c => generateNode(c, childCtx)).join("");
    }
    const listExpr = String(node.iterable ?? "").replace(/^\{/, "").replace(/\}$/, "");
    const tpl = tplSource.replace(/"/g, "&#34;");
    return `<tw-for data-tw-var="${node.varName}"${node.indexName ? ` data-tw-index="${node.indexName}"` : ""} data-tw-list="${listExpr}" data-tw-tpl="${tpl}">${html}</tw-for>`;
  }

  return html;
}

function generateWhile(node: WhileNode, ctx: CodegenContext): string {
  const condVal = evaluate(node.condition, ctx.stateVars);
  // Static SSR semantics: state cannot mutate during codegen, so a truthy
  // `while` would either render nothing (false) or loop forever (true).
  // Render the body exactly once when the condition is truthy.
  if (!isTruthy(condVal)) return "";
  return node.body.map(c => generateNode(c, ctx)).join("");
}

function generateScriptBlock(node: ScriptBlock, ctx: CodegenContext): string {
  if (node.src) {
    const attrs = [`src="${node.src}"`];
    if (node.isModule) attrs.push('type="module"');
    if (node.isAsync) attrs.push("async");
    if (node.isDeferred) attrs.push("defer");
    if (node.crossOrigin) attrs.push(`crossorigin="${node.crossOrigin}"`);
    if (node.integrity) attrs.push(`integrity="${node.integrity}"`);
    return `<script ${attrs.join(" ")}></script>`;
  }

  if (node.isModule) {
    return `<script type="module">${node.content}</script>`;
  }

  ctx.inlineScripts.push(node.content);
  return `<script>${node.content}</script>`;
}

function generateStyleBlock(node: StyleBlock, ctx: CodegenContext): string {
  // Style blocks use TSS syntax (bg #fff) -- compile to real CSS.
  const css = compileTSS(node.content);
  if (node.scoped && ctx.scopeId) {
    ctx.inlineStyles.push(addScope(css, ctx.scopeId));
  } else {
    ctx.inlineStyles.push(css);
  }
  return "";
}

function generateTwmBlock(node: TwmBlock, ctx: CodegenContext): string {
  return `<!-- twm: ${node.handler}(${node.method}) -->`;
}

function generateComment(node: CommentNode): string {
  if (node.isConditional) {
    return `<!--${node.value}-->`;
  }
  return `<!-- ${node.value} -->`;
}

function generateFragment(node: FragmentNode, ctx: CodegenContext): string {
  return node.children.map(c => generateNode(c, ctx)).join("");
}

function generateSlot(node: SlotNode, ctx: CodegenContext): string {
  // Pre-rendered HTML (layout chaining) takes priority.
  const slotHTML: string | undefined = (ctx as any).slotHTML;
  if (slotHTML !== undefined) return slotHTML;
  // Usage-site children passed to the enclosing component, if any.
  const slotContent: ASTNode[] | undefined = (ctx as any).slotContent;
  if (slotContent && slotContent.length > 0) {
    return slotContent.map(c => generateNode(c, ctx)).join("");
  }
  // Render fallback content, wrapped in markers so a layout wrapper can
  // substitute the page content at the slot position.
  const fallback = node.fallback.map(c => generateNode(c, ctx)).join("");
  return `<!-- tw:slot:${node.name} -->${fallback}<!-- /tw:slot:${node.name} -->`;
}

// --- Streaming Generation -----------------------------------------------------

