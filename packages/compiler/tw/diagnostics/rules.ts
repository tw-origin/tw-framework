/** Individual diagnostic rules - checks for common TW issues. */

import { type Diagnostic } from "./types";
import { type Program } from "../ast/nodes";
import { forEachNode } from "../ast/visitors";
import { isElement, isText, isScriptBlock, isStyleBlock } from "../ast/nodes/types";
import { collectImports, collectStateDecls, getAllComponentNames } from "../ast/walkers";
import { createDiagnostic } from "./reporter";


// --- HTML/CSS/ARIA Reference Data ---------------------------------------------

const HTML_ELEMENTS = new Set([
  "html", "head", "body", "div", "span", "p", "a", "img", "ul", "ol", "li",
  "table", "tr", "td", "th", "thead", "tbody", "tfoot", "caption", "col", "colgroup",
  "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "meta", "link", "title", "base",
  "script", "style", "noscript", "template", "slot", "form", "input", "textarea",
  "button", "select", "option", "optgroup", "label", "fieldset", "legend", "output",
  "progress", "meter", "details", "summary", "dialog", "menu", "nav", "header",
  "footer", "main", "section", "article", "aside", "address", "figure", "figcaption",
  "picture", "source", "video", "audio", "track", "iframe", "embed", "object", "param",
  "canvas", "svg", "math", "pre", "code", "kbd", "samp", "var", "blockquote", "q",
  "cite", "abbr", "dfn", "time", "mark", "ruby", "rt", "rp", "bdi", "bdo", "wbr",
  "datalist", "keygen", "frame", "frameset", "noframes", "area", "map", "marquee",
]);

const HTML_ATTRIBUTES = new Set([
  "accept", "accept-charset", "accesskey", "action", "align", "alt", "async",
  "autocomplete", "autofocus", "autoplay", "bgcolor", "border", "charset", "checked",
  "cite", "class", "cols", "colspan", "content", "contenteditable", "controls",
  "coords", "data", "datetime", "default", "defer", "dir", "dirname", "disabled",
  "download", "draggable", "enctype", "for", "form", "formaction", "headers",
  "height", "hidden", "high", "href", "hreflang", "id", "ismap", "kind", "label",
  "lang", "list", "loop", "low", "max", "maxlength", "media", "method", "min",
  "multiple", "muted", "name", "novalidate", "onabort", "onafterprint", "onbeforeprint",
  "onbeforeunload", "onblur", "oncanplay", "oncanplaythrough", "onclick", "oncontextmenu",
  "oncopy", "oncuechange", "oncut", "ondblclick", "ondrag", "ondragend", "ondragenter",
  "ondragleave", "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied",
  "onended", "onerror", "onfocus", "onhashchange", "oninput", "oninvalid", "onkeydown",
  "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart",
  "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel",
  "onoffline", "ononline", "onpagehide", "onpageshow", "onpaste", "onpause", "onplay",
  "onplaying", "onpopstate", "onprogress", "onratechange", "onreset", "onresize",
  "onscroll", "onsearch", "onseeked", "onseeking", "onselect", "onstalled", "onstorage",
  "onsubmit", "onsuspend", "ontimeupdate", "ontoggle", "onunload", "onvolumechange",
  "onwaiting", "onwheel", "open", "optimum", "pattern", "placeholder", "poster",
  "preload", "readonly", "rel", "required", "reversed", "rows", "rowspan", "sandbox",
  "scope", "selected", "shape", "size", "sizes", "span", "spellcheck", "src", "srcdoc",
  "srclang", "srcset", "start", "step", "style", "tabindex", "target", "title",
  "translate", "type", "usemap", "value", "width", "wrap", "integrity", "crossorigin",
  "nonce", "slot", "is", "part", "role", "tabindex", "enterkeyhint", "inert",
  "inputmode", "itemscope", "itemprop", "itemtype", "itemid", "itemref",
]);

const GLOBAL_ATTRIBUTES = new Set([
  "class", "id", "style", "title", "lang", "dir", "tabindex", "accesskey",
  "contenteditable", "contextmenu", "data-", "draggable", "dropzone", "hidden",
  "inert", "itemid", "itemprop", "itemref", "itemscope", "itemtype", "lang",
  "nonce", "part", "slot", "spellcheck", "translate", "enterkeyhint",
  "role", "aria-", "on", "is",
]);

const CSS_PROPERTIES = new Set([
  "align-content", "align-items", "align-self", "all", "animation", "animation-delay",
  "animation-direction", "animation-duration", "animation-fill-mode", "animation-iteration-count",
  "animation-name", "animation-play-state", "animation-timing-function", "backface-visibility",
  "background", "background-attachment", "background-blend-mode", "background-clip",
  "background-color", "background-image", "background-origin", "background-position",
  "background-position-x", "background-position-y", "background-repeat", "background-size",
  "border", "border-bottom", "border-bottom-color", "border-bottom-left-radius",
  "border-bottom-right-radius", "border-bottom-style", "border-bottom-width", "border-collapse",
  "border-color", "border-image", "border-image-outset", "border-image-repeat",
  "border-image-slice", "border-image-source", "border-image-width", "border-left",
  "border-left-color", "border-left-style", "border-left-width", "border-radius",
  "border-right", "border-right-color", "border-right-style", "border-right-width",
  "border-spacing", "border-style", "border-top", "border-top-color",
  "border-top-left-radius", "border-top-right-radius", "border-top-style",
  "border-top-width", "border-width", "bottom", "box-decoration-break", "box-shadow",
  "box-sizing", "break-after", "break-before", "break-inside", "caption-side",
  "caret-color", "clear", "clip", "clip-path", "color", "column-count", "column-fill",
  "column-gap", "column-rule", "column-rule-color", "column-rule-style",
  "column-rule-width", "column-span", "column-width", "columns", "content",
  "counter-increment", "counter-reset", "cursor", "direction", "display",
  "empty-cells", "filter", "flex", "flex-basis", "flex-direction", "flex-flow",
  "flex-grow", "flex-shrink", "flex-wrap", "float", "font", "font-family",
  "font-feature-settings", "font-kerning", "font-language-override", "font-size",
  "font-size-adjust", "font-stretch", "font-style", "font-synthesis", "font-variant",
  "font-variant-alternates", "font-variant-caps", "font-variant-east-asian",
  "font-variant-ligatures", "font-variant-numeric", "font-variant-position",
  "font-weight", "grid", "grid-area", "grid-auto-columns", "grid-auto-flow",
  "grid-auto-rows", "grid-column", "grid-column-end", "grid-column-gap",
  "grid-column-start", "grid-gap", "grid-row", "grid-row-end", "grid-row-gap",
  "grid-row-start", "grid-template", "grid-template-areas", "grid-template-columns",
  "grid-template-rows", "hanging-punctuation", "height", "hyphens", "image-orientation",
  "image-rendering", "isolation", "justify-content", "justify-items", "justify-self",
  "left", "letter-spacing", "line-break", "line-height", "list-style", "list-style-image",
  "list-style-position", "list-style-type", "margin", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "mask", "mask-clip", "mask-composite", "mask-image",
  "mask-mode", "mask-origin", "mask-position", "mask-repeat", "mask-size", "mask-type",
  "max-height", "max-width", "min-height", "min-width", "mix-blend-mode",
  "object-fit", "object-position", "opacity", "order", "orphans", "outline",
  "outline-color", "outline-offset", "outline-style", "outline-width", "overflow",
  "overflow-wrap", "overflow-x", "overflow-y", "padding", "padding-bottom",
  "padding-left", "padding-right", "padding-top", "page-break-after",
  "page-break-before", "page-break-inside", "perspective", "perspective-origin",
  "pointer-events", "position", "quotes", "resize", "right", "scroll-behavior",
  "tab-size", "table-layout", "text-align", "text-align-last", "text-combine-upright",
  "text-decoration", "text-decoration-color", "text-decoration-line",
  "text-decoration-skip", "text-decoration-style", "text-emphasis",
  "text-emphasis-color", "text-emphasis-position", "text-emphasis-style",
  "text-indent", "text-justify", "text-orientation", "text-overflow",
  "text-rendering", "text-shadow", "text-transform", "text-underline-position",
  "top", "transform", "transform-origin", "transform-style", "transition",
  "transition-delay", "transition-duration", "transition-property",
  "transition-timing-function", "unicode-bidi", "user-select", "vertical-align",
  "visibility", "white-space", "widows", "width", "will-change", "word-break",
  "word-spacing", "word-wrap", "writing-mode", "z-index", "gap", "aspect-ratio",
  "inset", "place-content", "place-items", "place-self", "appearance",
]);

const CSS_ALIASES: Record<string, string> = {
  "bg": "background", "bgcolor": "background-color", "m": "margin",
  "mt": "margin-top", "mb": "margin-bottom", "ml": "margin-left", "mr": "margin-right",
  "p": "padding", "pt": "padding-top", "pb": "padding-bottom", "pl": "padding-left",
  "pr": "padding-right", "w": "width", "h": "height", "c": "color",
  "fs": "font-size", "fw": "font-weight", "ff": "font-family", "lh": "line-height",
  "ta": "text-align", "td": "text-decoration", "tt": "text-transform",
  "d": "display", "pos": "position", "z": "z-index", "cur": "cursor",
  "br": "border-radius", "b": "border",
  "bt": "border-top", "bb": "border-bottom", "bl": "border-left", "brr": "border-right",
  "fl": "flex", "fd": "flex-direction", "ai": "align-items",
  "jc": "justify-content", "ac": "align-content", "as": "align-self",
  "og": "object-fit", "op": "opacity", "ov": "overflow", "ox": "overflow-x",
  "oy": "overflow-y", "ws": "white-space", "ww": "word-wrap", "wb": "word-break",
  "ts": "text-shadow", "tr": "transition", "tf": "transform",
};

const EVENT_TYPES = new Set([
  "click", "dblclick", "mousedown", "mouseup", "mousemove", "mouseover", "mouseout",
  "mouseenter", "mouseleave", "keydown", "keyup", "keypress", "focus", "blur",
  "submit", "reset", "change", "input", "select", "scroll", "resize", "load",
  "unload", "abort", "error", "contextmenu", "wheel", "copy", "cut", "paste",
  "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop",
  "play", "pause", "playing", "ended", "canplay", "canplaythrough", "seeking",
  "seeked", "timeupdate", "durationchange", "volumechange", "ratechange",
  "stalled", "suspend", "waiting", "progress", "loadstart", "loadeddata",
  "loadedmetadata", "emptied", "hashchange", "popstate", "storage", "online",
  "offline", "pageshow", "pagehide", "beforeprint", "afterprint", "beforeunload",
  "toggle", "animationstart", "animationend", "animationiteration",
  "transitionstart", "transitionend", "transitionrun", "transitioncancel",
  "pointerdown", "pointerup", "pointermove", "pointerover", "pointerout",
  "pointerenter", "pointerleave", "pointercancel", "gotpointercapture",
  "lostpointercapture", "touchstart", "touchend", "touchmove", "touchcancel",
  "message", "open", "close", "error", "connect", "statechange",
]);

const ARIA_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "button",
  "cell", "checkbox", "columnheader", "combobox", "complementary",
  "contentinfo", "definition", "dialog", "directory", "document", "feed",
  "figure", "form", "grid", "gridcell", "group", "heading", "img",
  "link", "list", "listbox", "listitem", "log", "main", "marquee",
  "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio",
  "navigation", "none", "note", "option", "presentation", "progressbar",
  "radio", "radiogroup", "region", "row", "rowgroup", "rowheader",
  "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton",
  "status", "switch", "tab", "tablist", "tabpanel", "term", "textbox",
  "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem",
  "navigation", "tab", "tabpanel", "application", "article", "banner",
]);

const ARIA_ATTRIBUTES = new Set([
  "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-busy",
  "aria-checked", "aria-colcount", "aria-colindex", "aria-colspan",
  "aria-controls", "aria-current", "aria-describedby", "aria-disabled",
  "aria-dropeffect", "aria-errormessage", "aria-expanded", "aria-flowto",
  "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid",
  "aria-keyshortcuts", "aria-label", "aria-labelledby", "aria-level",
  "aria-live", "aria-modal", "aria-multiline", "aria-multiselectable",
  "aria-orientation", "aria-owns", "aria-placeholder", "aria-posinset",
  "aria-pressed", "aria-readonly", "aria-relevant", "aria-required",
  "aria-roledescription", "aria-rowcount", "aria-rowindex", "aria-rowspan",
  "aria-selected", "aria-setsize", "aria-sort", "aria-valuemax",
  "aria-valuemin", "aria-valuenow", "aria-valuetext",
]);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}



export function checkUnknownTags(program: Program, filePath: string, diags: Diagnostic[]): void {
  forEachNode(program, (node) => {
    if (!isElement(node)) return;
    if (node.tag[0] === node.tag[0]?.toUpperCase()) return; // Component
    if (HTML_ELEMENTS.has(node.tag.toLowerCase())) return;
    diags.push(createDiagnostic("TW003", node.line, node.col, filePath, `<${node.tag}>`, [
      "Check spelling or use a known HTML tag",
      `Valid tags: div, span, p, h1-h6, a, img, ul, ol, li, table, form, input, button...`,
    ]));
  });
}

export function checkCSSProperties(program: Program, filePath: string, diags: Diagnostic[]): void {
  forEachNode(program, (node) => {
    if (!isElement(node)) return;
    for (const style of node.styles) {
      const resolved = CSS_ALIASES[style.property] || style.property;
      if (!CSS_PROPERTIES.has(resolved) && !style.property.startsWith("--")) {
        diags.push(createDiagnostic("TW004", style.line, style.col, filePath, style.property, [
          `Did you mean: ${Array.from(CSS_PROPERTIES).filter(p => p.startsWith(style.property.slice(0, 3))).slice(0, 5).join(", ")}?`,
        ]));
      }
    }
  });
}

export function checkEventTypes(program: Program, filePath: string, diags: Diagnostic[]): void {
  forEachNode(program, (node) => {
    if (!isElement(node)) return;
    for (const event of node.events) {
      if (!EVENT_TYPES.has(event.event)) {
        diags.push(createDiagnostic("TW005", event.line, event.col, filePath, `on:${event.event}`, [
          `Valid events: ${Array.from(EVENT_TYPES).slice(0, 10).join(", ")}...`,
        ]));
      }
    }
  });
}

export function checkAttributes(program: Program, filePath: string, diags: Diagnostic[]): void {
  forEachNode(program, (node) => {
    if (!isElement(node)) return;
    const seen = new Set<string>();
    for (const attr of node.attrs) {
      if (seen.has(attr.name)) {
        diags.push(createDiagnostic("TW015", attr.line, attr.col, filePath, attr.name, [
          `Remove duplicate attribute: ${attr.name}`,
        ], {
          title: "Remove duplicate attribute",
          description: `Remove the duplicate "${attr.name}" attribute`,
          range: { startLine: attr.line, startCol: attr.col, endLine: attr.line, endCol: attr.col + attr.name.length },
          replacement: "",
        }));
      }
      seen.add(attr.name);

      if (!GLOBAL_ATTRIBUTES.has(attr.name) && !HTML_ATTRIBUTES.has(attr.name) &&
          !attr.name.startsWith("data-") && !attr.name.startsWith("aria-") &&
          !attr.name.startsWith("on")) {
        diags.push(createDiagnostic("TW006", attr.line, attr.col, filePath, attr.name));
      }
    }
  });
}

export function checkAccessibility(program: Program, filePath: string, diags: Diagnostic[]): void {
  let prevHeadingLevel = 0;
  forEachNode(program, (node) => {
    if (!isElement(node)) return;
    const tag = node.tag.toLowerCase();

    // Image without alt
    if (tag === "img") {
      const hasAlt = node.attrs.some(a => a.name === "alt");
      if (!hasAlt) {
        diags.push(createDiagnostic("TW040", node.line, node.col, filePath, `<img>`, [
          "Add alt=\"description\" for accessibility",
        ], {
          title: "Add alt attribute",
          description: "Add an alt attribute to the image",
          range: { startLine: node.line, startCol: node.col, endLine: node.line, endCol: node.col + node.tag.length + 1 },
          replacement: `<img alt=""`,
        }));
      }
    }

    // Input without label
    if (tag === "input") {
      const hasId = node.attrs.some(a => a.name === "id");
      const hasAriaLabel = node.attrs.some(a => a.name === "aria-label");
      if (!hasId && !hasAriaLabel) {
        diags.push(createDiagnostic("TW041", node.line, node.col, filePath, `<input>`, [
          "Add a <label> element or aria-label attribute",
        ]));
      }
    }

    // Button without text
    if (tag === "button") {
      const hasText = node.children.some(c => c.type === "Text" && (c as any).value.trim());
      const hasAriaLabel = node.attrs.some(a => a.name === "aria-label");
      if (!hasText && !hasAriaLabel) {
        diags.push(createDiagnostic("TW042", node.line, node.col, filePath, `<button>`, [
          "Add text content or aria-label",
        ]));
      }
    }

    // Heading hierarchy
    const headingMatch = tag.match(/^h([1-6])$/);
    if (headingMatch) {
      const level = parseInt(headingMatch[1], 10);
      if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
        diags.push(createDiagnostic("TW046", node.line, node.col, filePath, `<${tag}>`, [
          `Heading level ${level} skips from level ${prevHeadingLevel}. Use h${prevHeadingLevel + 1} instead.`,
        ]));
      }
      prevHeadingLevel = level;
    }

    // ARIA role validation
    const roleAttr = node.attrs.find(a => a.name === "role");
    if (roleAttr && typeof roleAttr.value === "string" && !ARIA_ROLES.has(roleAttr.value)) {
      diags.push(createDiagnostic("TW044", roleAttr.line, roleAttr.col, filePath, `role="${roleAttr.value}"`, [
        `Valid roles: ${Array.from(ARIA_ROLES).slice(0, 10).join(", ")}...`,
      ]));
    }

    // ARIA attribute validation
    for (const attr of node.attrs) {
      if (attr.name.startsWith("aria-") && !ARIA_ATTRIBUTES.has(attr.name)) {
        diags.push(createDiagnostic("TW045", attr.line, attr.col, filePath, attr.name));
      }
    }
  });
}

export function checkPerformance(program: Program, filePath: string, diags: Diagnostic[]): void {
  let nodeCount = 0;
  let maxDepth = 0;

  forEachNode(program, (node, ctx) => {
    nodeCount++;
    maxDepth = Math.max(maxDepth, ctx.depth);

    if (isScriptBlock(node) && node.content.length > 5000) {
      diags.push(createDiagnostic("TW050", node.line, node.col, filePath, undefined, [
        "Extract to external .js file for better caching",
      ]));
    }

    if (isStyleBlock(node) && node.content.length > 5000) {
      diags.push(createDiagnostic("TW051", node.line, node.col, filePath, undefined, [
        "Extract to external .css file for better caching",
      ]));
    }

    if (isElement(node) && node.tag.toLowerCase() === "img") {
      const hasLazy = node.attrs.some(a => a.name === "loading" && a.value === "lazy");
      if (!hasLazy) {
        diags.push(createDiagnostic("TW054", node.line, node.col, filePath, undefined, [
          "Add loading=\"lazy\" for below-fold images",
        ]));
      }
    }
  });

  if (maxDepth > 20) {
    diags.push(createDiagnostic("TW052", 1, 1, filePath, `Depth: ${maxDepth}`, [
      "Consider flattening the DOM structure for better performance",
    ]));
  }

  if (nodeCount > 500) {
    diags.push(createDiagnostic("TW053", 1, 1, filePath, `Nodes: ${nodeCount}`, [
      "Consider breaking this page into smaller components",
    ]));
  }
}

export function checkSecurity(program: Program, filePath: string, diags: Diagnostic[]): void {
  forEachNode(program, (node) => {
    if (isText(node) && node.isInterpolated) {
      // Check for potential XSS
      if (node.value.includes("innerHTML") || node.value.includes("document.write")) {
        diags.push(createDiagnostic("TW061", node.line, node.col, filePath, node.value.slice(0, 50)));
      }
    }

    if (isScriptBlock(node)) {
      if (node.content.includes("eval(")) {
        diags.push(createDiagnostic("TW068", node.line, node.col, filePath, "eval() usage"));
      }
      if (node.content.includes("document.write")) {
        diags.push(createDiagnostic("TW061", node.line, node.col, filePath, "document.write() usage"));
      }
      if (node.src && !node.integrity) {
        diags.push(createDiagnostic("TW063", node.line, node.col, filePath, `src="${node.src}"`, [
          "Add integrity attribute for SRI verification",
        ]));
      }
    }

    if (isElement(node) && node.tag.toLowerCase() === "a") {
      const hrefAttr = node.attrs.find(a => a.name === "href");
      if (hrefAttr && typeof hrefAttr.value === "string" && hrefAttr.value.startsWith("http")) {
        const targetAttr = node.attrs.find(a => a.name === "target");
        if (targetAttr && targetAttr.value === "_blank") {
          const hasNoopener = node.attrs.some(a => a.name === "rel" && typeof a.value === "string" && a.value.includes("noopener"));
          if (!hasNoopener) {
            diags.push(createDiagnostic("TW076", node.line, node.col, filePath, `target="_blank"`, [
              "Add rel=\"noopener noreferrer\" for security",
            ], {
              title: "Add rel=\"noopener\"",
              description: "Add rel attribute with noopener for security",
              range: { startLine: node.line, startCol: node.col, endLine: node.line, endCol: node.col + 5 },
              replacement: '<a rel="noopener noreferrer"',
            }));
          }
        }
      }
    }
  });
}

export function checkBestPractices(program: Program, filePath: string, diags: Diagnostic[]): void {
  forEachNode(program, (node) => {
    if (!isElement(node)) return;

    // Div with click -- consider button
    if (node.tag.toLowerCase() === "div" && node.events.some(e => e.event === "click")) {
      diags.push(createDiagnostic("TW072", node.line, node.col, filePath, undefined, [
        "Use <button> for interactive elements",
      ]));
    }

    // Inline styles
    if (node.styles.length > 3) {
      diags.push(createDiagnostic("TW071", node.line, node.col, filePath, `${node.styles.length} inline styles`, [
        "Move styles to a CSS class",
      ]));
    }

    // Image without dimensions
    if (node.tag.toLowerCase() === "img") {
      const hasWidth = node.attrs.some(a => a.name === "width");
      const hasHeight = node.attrs.some(a => a.name === "height");
      if (!hasWidth || !hasHeight) {
        diags.push(createDiagnostic("TW075", node.line, node.col, filePath, undefined, [
          "Add width and height to prevent layout shift",
        ]));
      }
    }
  });
}

export function checkSemanticErrors(program: Program, filePath: string, diags: Diagnostic[]): void {
  // Check for circular component references
  const componentNames = getAllComponentNames(program);
  for (const name of componentNames) {
    // Simplified check -- a full implementation would use the component registry
  }

  // Check for empty bindings
  forEachNode(program, (node) => {
    if (!isElement(node)) return;
    for (const binding of node.bindings) {
      if (!binding.expression) {
        diags.push(createDiagnostic("TW032", binding.line, binding.col, filePath, `:${binding.property}`));
      }
    }
  });
}

export function checkDirectives(program: Program, filePath: string, diags: Diagnostic[]): void {
  const seenDirectives = new Set<string>();
  for (const dir of program.directives) {
    const key = dir.type;
    if (seenDirectives.has(key) && (key === "PageDirective" || key === "LayoutDirective" || key === "RenderDirective")) {
      diags.push(createDiagnostic("TW020", (dir as any).line ?? 1, (dir as any).col ?? 1, filePath, key));
    }
    seenDirectives.add(key);
  }
}

export function checkUnusedDeclarations(program: Program, filePath: string, diags: Diagnostic[]): void {
  const stateDecls = collectStateDecls(program);
  const imports = collectImports(program);

  // Check unused state variables
  const allText = JSON.stringify(program);
  for (const decl of stateDecls) {
    const usagePattern = `{${decl.name}}`;
    if (!allText.includes(usagePattern) && !allText.includes(decl.name)) {
      diags.push(createDiagnostic("TW026", decl.line, decl.col, filePath, decl.name, [
        `Remove unused state variable: ${decl.name}`,
      ]));
    }
  }

  // Check unused imports
  for (const imp of imports) {
    for (const item of imp.items) {
      if (!allText.includes(item)) {
        diags.push(createDiagnostic("TW025", imp.line, imp.col, filePath, item, [
          `Remove unused import: ${item}`,
        ]));
      }
    }
  }
}

