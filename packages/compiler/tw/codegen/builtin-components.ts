/**
 * Builtin framework components — `@tw/optImage` today, more tomorrow.
 *
 * A page imports a builtin by its package specifier:
 *
 *   import Image from "@tw/optImage"
 *
 * The import never reaches the browser — the tag is replaced at codegen
 * time with plain optimized HTML. Adding a new builtin (e.g. `@tw/font`)
 * means: register the specifier here + a renderer that turns props into
 * HTML, and exempt the specifier in the client-module boundary check.
 */

import {
  imageAttributesFor,
  DEFAULT_IMAGE_CONFIG,
  type ImageConfig,
  type ImageTagOptions,
} from "@tw/optImage";
import { linkAttributesFor, type LinkTagOptions } from "@tw/RouterLink";
import { renderHead, type HeadOptions } from "@tw/Head";
import { renderScript, type ScriptOptions } from "@tw/Script";
import { renderForm, type FormOptions } from "@tw/Form";
import type { Program } from "../ast/nodes";
import type { ImportDirective } from "../ast/nodes/directives";

/** Specifiers recognized as builtin components (never bundled client-side). */
export const BUILTIN_COMPONENT_SPECIFIERS: string[] = [
  "@tw/optImage", "@tw/RouterLink", "@tw/Head", "@tw/Script", "@tw/Form",
];

// --- Image transform config (set from tw.config.ts `images`) ------------------

let imageConfig: ImageConfig = DEFAULT_IMAGE_CONFIG;

export function setBuiltinImageConfig(cfg: Partial<ImageConfig> | undefined | null): void {
  if (cfg && typeof cfg === "object") {
    imageConfig = {
      ...DEFAULT_IMAGE_CONFIG,
      ...cfg,
      remoteAllowHosts: Array.isArray((cfg as any).remoteAllowHosts)
        ? (cfg as any).remoteAllowHosts
        : Array.isArray((cfg as any).remote?.allowHosts)
          ? (cfg as any).remote.allowHosts
          : DEFAULT_IMAGE_CONFIG.remoteAllowHosts,
    };
  }
}

export function getBuiltinImageConfig(): ImageConfig {
  return imageConfig;
}

// --- Import scanning -----------------------------------------------------------

/**
 * Map of localName -> specifier for every builtin imported by a page.
 * `import optImage from "@tw/optImage"` -> { "optImage": "@tw/optImage" }.
 */
// `import { RouterLink } from "tw"` is a plausible
// spelling users write -- resolve named imports from the "tw" / "@tw/server"
// specifier to the matching builtin component.
const TW_NAMED_BUILTINS: Record<string, string> = {
  RouterLink: "@tw/RouterLink",
  optImage: "@tw/optImage",
  Head: "@tw/Head",
  Script: "@tw/Script",
  Form: "@tw/Form",
  Image: "@tw/optImage",
};

export function collectBuiltinImports(program: Program): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of (program as any).directives ?? []) {
    if (dir.type !== "ImportDirective") continue;
    const imp = dir as ImportDirective;
    if (imp.source === "tw" || imp.source === "@tw/server") {
      for (const item of imp.items ?? []) {
        const name = item.split(" as ").pop()!.trim();
        const spec = TW_NAMED_BUILTINS[name];
        if (spec) out.set(name, spec);
      }
      if (imp.defaultImport && TW_NAMED_BUILTINS[imp.defaultImport]) {
        out.set(imp.defaultImport, TW_NAMED_BUILTINS[imp.defaultImport]);
      }
    }
    if (!BUILTIN_COMPONENT_SPECIFIERS.includes(imp.source)) continue;
    if (imp.defaultImport) out.set(imp.defaultImport, imp.source);
    for (const item of imp.items ?? []) {
      // `import { Image } from "@tw/optImage"` and aliased forms
      out.set(item.split(" as ").pop()!.trim(), imp.source);
    }
    if (imp.namespaceImport) out.set(imp.namespaceImport, imp.source);
  }
  return out;
}

// --- Renderers -------------------------------------------------------------------

/** URLs keep `&` (query separators) but quotes/angle brackets stay escaped. */
function escapeUrl(v: string): string {
  return String(v).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeAttr(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render an optimized <img> — shared by the `optImage` component and the
 * `optimize` attribute. Props arrive pre-interpolated (strings).
 */
export function generateImageTag(props: Record<string, string>): string {
  const src = (props.src ?? "").trim();
  if (!src) return "<!-- @tw/optImage: missing src -->";

  const width = parseInt(props.width ?? "0", 10) || 0;
  const height = parseInt(props.height ?? "0", 10) || 0;
  const quality = parseInt(props.quality ?? "0", 10) || undefined;
  const priority = props.priority === "true";
  // "solid" is the documented value; "blur" stays as an accepted alias for
  // the same soft solid-color placeholder.
  const placeholder = props.placeholder === "solid" || props.placeholder === "blur";

  const opts: ImageTagOptions = { src, width: width || undefined, height: height || undefined, quality, priority, placeholder: placeholder ? "blur" : "empty" };
  const a = imageAttributesFor(opts, imageConfig);

  // Accessibility: a missing alt is almost always a mistake. Warn at build
  // time; the output still carries alt="" for safety.
  if (props.alt === undefined) {
    console.warn(`  [tw/optImage] "${src}" has no alt — add alt "..." for meaningful images, or alt "" to mark it decorative`);
  }

  const attrs: string[] = [
    `src="${escapeUrl(a.src)}"`,
    `alt="${escapeAttr(props.alt ?? "")}"`,
    `loading="${a.loading}"`,
    `decoding="async"`,
  ];
  if (width) attrs.push(`width="${width}"`);
  if (height) attrs.push(`height="${height}"`);
  if (a.srcset) attrs.push(`srcset="${escapeUrl(a.srcset)}"`);
  // Priority images: eager loading + high fetch priority. Browsers that do
  // not know fetchpriority simply ignore the extra attribute.
  if (priority) attrs.push(`fetchpriority="high"`);
  if (a.sizes) attrs.push(`sizes="${escapeUrl(a.sizes)}"`);
  if (props.class) attrs.push(`class="${escapeAttr(props.class)}"`);
  if (props.id) attrs.push(`id="${escapeAttr(props.id)}"`);
  if (placeholder) {
    attrs.push(`data-tw-placeholder="${escapeAttr(props.placeholder)}"`);
    const baseStyle = `background-color:#e5e7eb;border-radius:inherit`;
    attrs.push(`style="${props.style ? escapeAttr(props.style) + ";" : ""}${baseStyle}"`);
  } else if (props.style) {
    attrs.push(`style="${escapeAttr(props.style)}"`);
  }

  return `<img ${attrs.join(" ")}>`;
}

/**
 * Resolve which builtin (if any) a tag refers to. The import's local name
 * binds directly (import optImage / import RouterLink); canonical aliases
 * keep working regardless of the local name chosen for the import.
 */
export function resolveBuiltin(tag: string, builtins: Map<string, string>): string | null {
  const direct = builtins.get(tag);
  if (direct) return direct;
  const specs = [...builtins.values()];
  if (tag === "optImage" && specs.includes("@tw/optImage")) {
    return "@tw/optImage";
  }
  if (tag === "RouterLink" && specs.includes("@tw/RouterLink")) {
    return "@tw/RouterLink";
  }
  if (tag === "Head" && specs.includes("@tw/Head")) return "@tw/Head";
  if (tag === "Script" && specs.includes("@tw/Script")) return "@tw/Script";
  if (tag === "Form" && specs.includes("@tw/Form")) return "@tw/Form";
  return null;
}

/**
 * The grammar parses `prefetch false` as [prefetch=true, false=true] (the
 * `false` keyword becomes its own bare attribute) — collapse those back into
 * the intended value. `prefetch null` (Next-style default) collapses to
 * undefined. String forms ("viewport"/"hover"/"false"/"true") arrive intact.
 */
function normalizePrefetchProp(props: Record<string, string>): any {
  let p = props.prefetch;
  if (p === "true" && props.false === "true") p = "false";
  if (p === "true" && props.null === "true") p = undefined;
  return p;
}

/**
 * Render a RouterLink — an SEO-friendly <a> with SPA navigation markers.
 * Internal links carry data-tw-link (client runtime intercepts); external
 * links get safe defaults (new tab + noopener) unless overridden.
 */
export function generateRouterLinkTag(props: Record<string, string>, textContent: string): string {
  // accept Next-style `to` as an href alias
  const href = (props.href ?? props.to ?? "").trim();
  if (!href) return `<!-- @tw/RouterLink: missing href -->`;

  const opts: LinkTagOptions = {
    href,
    class: props.class || undefined,
    id: props.id || undefined,
    rel: props.rel || undefined,
    target: props.target || undefined,
    activeClass: props.activeClass || props.activeclass || undefined,
    external: props.external === "true",
    native: props.native === "true",
    noPrefetch: props.noPrefetch === "true",
    prefetch: normalizePrefetchProp(props),
  };
  const a = linkAttributesFor(opts);

  const parts: string[] = [`href="${escapeUrl(a.href)}"`];
  for (const [k, v] of Object.entries(a.attrs)) {
    if (v === "") parts.push(k); // boolean marker attributes
    else parts.push(`${k}="${escapeAttr(v)}"`);
  }
  return `<a ${parts.join(" ")}>${escapeAttr(textContent)}</a>`;
}

/** Dispatch a builtin component render. Returns null when unknown. */
export function generateBuiltinTag(
  specifier: string,
  props: Record<string, string>,
  textContent: string
): string | null {
  if (specifier === "@tw/optImage") return generateImageTag(props);
  if (specifier === "@tw/RouterLink") return generateRouterLinkTag(props, textContent);
  if (specifier === "@tw/Head") return generateHeadTag(props);
  if (specifier === "@tw/Script") return generateScriptTag(props);
  if (specifier === "@tw/Form") return generateFormTag(props, textContent);
  return null;
}


// --- @tw/Head ------------------------------------------------------------------

/**
 * `<Head title="..." description="..." ogImage="..." />` compiles to the meta
 * set a browser wants. Props are strings in a template, so the camelCase names
 * map straight onto HeadOptions.
 */
export function generateHeadTag(props: Record<string, string>): string {
  const o: HeadOptions = {};
  const pick = (prop: string, key: keyof HeadOptions) => {
    const v = props[prop] ?? props[prop.toLowerCase()];
    if (v !== undefined && v !== "") (o as Record<string, unknown>)[key] = v;
  };
  for (const k of [
    "title", "description", "canonical", "lang", "robots", "viewport", "themeColor", "charset",
    "ogTitle", "ogDescription", "ogImage", "ogUrl", "ogType", "ogSiteName", "ogLocale",
    "twitterCard", "twitterSite", "twitterCreator", "twitterTitle", "twitterDescription", "twitterImage",
    "jsonLd", "extra",
  ]) pick(k, k as keyof HeadOptions);

  // a bare `title` attribute on <Head> is the common case
  if (!o.title && props.title) o.title = props.title;
  return renderHead(o);
}

// --- @tw/Script ----------------------------------------------------------------

/**
 * `<Script src="..." strategy="lazyOnload" sri="sha384-..." nonce="..." />`
 * compiles to a real <script> tag with the right attributes.
 */
export function generateScriptTag(props: Record<string, string>): string {
  const inline = (props.children ?? "").trim() || undefined;
  const o: ScriptOptions = {
    src: (props.src ?? props.srcset ?? "").trim() || undefined,
    inline,
    strategy: (props.strategy ?? props.strategy) as ScriptOptions["strategy"],
    sri: props.sri || undefined,
    nonce: props.nonce || undefined,
    type: props.type || undefined,
    id: props.id || undefined,
    crossOrigin: props.crossorigin || props.crossOrigin || undefined,
    referrerPolicy: props.referrerpolicy || props.referrerPolicy || undefined,
    async: props.async === "true" || props.async === "",
    defer: props.defer === "true" || props.defer === "",
    once: props.once === "true" || props.once === "",
  };
  if (!o.src && !o.inline) return "<!-- @tw/Script: needs src or inline body -->";
  return renderScript(o);
}


// --- @tw/Form ------------------------------------------------------------------

/**
 * `<Form action="/subscribe" method="post">` compiles to a real <form> that
 * submits with JS off; `data-tw-form` lets the runtime upgrade it.
 */
export function generateFormTag(props: Record<string, string>, children = ""): string {
  const o: FormOptions = {
    action: (props.action ?? "").trim() || undefined,
    method: (props.method as FormOptions["method"]) || undefined,
    id: props.id || undefined,
    class: props.class || undefined,
    name: props.name || undefined,
    enctype: props.enctype || undefined,
    target: props.target || undefined,
    autoComplete: props.autocomplete || props.autoComplete || undefined,
    native: props.native === "true" || props.native === "",
    noValidate: props.novalidate === "true" || props.novalidate === "",
    submitName: props.submitName || props.submitname || undefined,
  };
  return renderForm(o, children);
}
