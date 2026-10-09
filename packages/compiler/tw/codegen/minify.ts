/**
 * HTML minifier -- deep HTML optimization pass.
 *
 * Removes unnecessary characters from HTML without changing semantics:
 * - Collapse whitespace between tags
 * - Remove HTML comments (except conditional comments)
 * - Remove redundant attributes (type="text/javascript", type="text/css")
 * - Remove quotes around simple attribute values
 * - Remove empty attributes
 * - Collapse boolean attributes
 * - Remove optional closing tags (</li>, </td>, etc.)
 * - Shorten inline scripts via simple minification
 *
 * Safety rules:
 * - Never remove whitespace inside <pre>, <textarea>, <code>
 * - Never remove whitespace that affects inline display
 * - Keep conditional comments <!--[if IE]>
 * - Don't touch content inside <script> and <style> (handled by JS/CSS minifiers)
 *
 * Performance: single-pass O(n) over the HTML string.
 */

// --- HTML Minifier ---------------------------------------------------

export interface MinifyHTMLOptions {
  /** Collapse whitespace between tags */
  collapseWhitespace?: boolean;
  /** Remove HTML comments */
  removeComments?: boolean;
  /** Remove redundant attributes (type="text/javascript" etc) */
  removeRedundantAttrs?: boolean;
  /** Remove empty attributes */
  removeEmptyAttrs?: boolean;
  /** Remove optional closing tags */
  removeOptionalTags?: boolean;
  /** Remove quotes around simple attributes */
  removeQuoteWrapping?: boolean;
  /** Collapse boolean attributes (disabled="disabled" -> disabled) */
  collapseBooleanAttrs?: boolean;
  /** Minify inline CSS */
  minifyCSS?: boolean;
  /** Minify inline JS */
  minifyJS?: boolean;
}

const DEFAULT_OPTIONS: Required<MinifyHTMLOptions> = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttrs: true,
  removeEmptyAttrs: true,
  removeOptionalTags: false,
  removeQuoteWrapping: false,
  collapseBooleanAttrs: true,
  minifyCSS: true,
  minifyJS: true,
};

/**
 * Minify an HTML string.
 */
export function minifyHTML(html: string, options?: MinifyHTMLOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = html;
  const originalSize = html.length;

  // 1. Remove comments (keep conditional comments)
  if (opts.removeComments) {
    result = removeComments(result);
  }

  // 2. Collapse whitespace (respect pre/textarea/code)
  if (opts.collapseWhitespace) {
    result = collapseWhitespace(result);
  }

  // 3. Remove redundant attributes
  if (opts.removeRedundantAttrs) {
    result = removeRedundantAttrs(result);
  }

  // 4. Collapse boolean attributes
  if (opts.collapseBooleanAttrs) {
    result = collapseBooleanAttrs(result);
  }

  // 5. Remove empty attributes
  if (opts.removeEmptyAttrs) {
    result = removeEmptyAttrs(result);
  }

  // 6. Remove optional closing tags
  if (opts.removeOptionalTags) {
    result = removeOptionalTags(result);
  }

  // 7. Remove quote wrapping (careful -- can break some edge cases)
  if (opts.removeQuoteWrapping) {
    result = removeQuoteWrapping(result);
  }

  return result;
}

// --- Individual Optimization Passes ----------------------------------

/**
 * Remove HTML comments, keeping conditional comments.
 */
function removeComments(html: string): string {
  // Cheap guard: a full-string regex scan is pointless when there is no comment.
  if (html.indexOf("<!--") === -1) return html;
  // Keep <!--[if ...]> ... <![endif]-->
  return html.replace(/<!--(?!\[if\s)[\s\S]*?-->/g, "");
}

/**
 * Collapse whitespace between tags.
 * Multiple spaces/newlines -> single space (or empty for block elements).
 *
 * The preserved-tag test is *anchored* (sticky `y`) and the closing-tag search
 * resumes from `lastIndex` -- the previous version ran
 * `html.substring(pos).match(re)` on every loop iteration, which allocated the
 * whole remaining string and scanned it, making this O(n^2).
 */
const PRESERVE_OPEN_RE = /<(pre|textarea|code|script|style)\b/iy;
const PRESERVE_CLOSE_RE = /<\/(pre|textarea|code|script|style)\s*>/gi;

function collapseWhitespace(html: string): string {
  const result: string[] = [];
  let pos = 0;
  let inPreserved = false;

  while (pos < html.length) {
    if (!inPreserved) {
      // Entering a preserved tag? Anchored test at `pos` -- no substring alloc.
      PRESERVE_OPEN_RE.lastIndex = pos;
      if (PRESERVE_OPEN_RE.test(html)) {
        inPreserved = true;
        // Find the end of the opening tag
        const gt = html.indexOf(">", pos);
        if (gt !== -1) {
          result.push(html.substring(pos, gt + 1));
          pos = gt + 1;
          continue;
        }
      }

      // Collapse whitespace
      const nextTag = html.indexOf("<", pos);
      if (nextTag === -1) {
        // Rest is text
        const text = html.substring(pos);
        result.push(collapseText(text));
        break;
      }

      if (nextTag > pos) {
        const text = html.substring(pos, nextTag);
        result.push(collapseText(text));
        pos = nextTag;
      } else {
        // We're already sitting at a tag (no text before it, e.g. "<div><p>")
        // -- copy the tag itself through unchanged and advance past its `>`.
        // Without this, `pos` never moves past `nextTag === pos` and the
        // loop spins forever.
        const gt = html.indexOf(">", pos);
        if (gt === -1) {
          // Unterminated tag -- copy the rest and stop.
          result.push(html.substring(pos));
          break;
        }
        result.push(html.substring(pos, gt + 1));
        pos = gt + 1;
      }
    } else {
      // In preserved tag -- copy as-is until closing tag. Global regex `exec`
      // searches forward from `lastIndex`, matching the old `substring().match()`
      // without building the substring.
      PRESERVE_CLOSE_RE.lastIndex = pos;
      const endMatch = PRESERVE_CLOSE_RE.exec(html);
      if (endMatch) {
        const endPos = endMatch.index + endMatch[0].length;
        result.push(html.substring(pos, endPos));
        pos = endPos;
        inPreserved = false;
      } else {
        result.push(html.substring(pos));
        break;
      }
    }
  }

  return result.join("");
}

/**
 * Collapse multiple whitespace characters into single space.
 * Remove leading/trailing whitespace in text nodes.
 */
function collapseText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^\s+/, " ")
    .replace(/\s+$/, " ");
}

/**
 * Remove redundant attributes:
 * - type="text/javascript" on <script>
 * - type="text/css" on <style>
 * - type="text" on <input>
 * - language="javascript" on <script>
 * - method="get" on <form>
 */
function removeRedundantAttrs(html: string): string {
  // Each pass is guarded by a cheap substring test -- scanning the whole
  // document with a regex costs far more than an `indexOf` that usually fails.
  if (html.indexOf("type=") !== -1) {
    html = html
      // script type="text/javascript"
      .replace(/<script([^>]*)\stype=["']text\/javascript["']([^>]*)>/gi, "<script$1$2>")
      // style type="text/css"
      .replace(/<style([^>]*)\stype=["']text\/css["']([^>]*)>/gi, "<style$1$2>")
      // input type="text"
      .replace(/<input([^>]*)\stype=["']text["']([^>]*)>/gi, "<input$1$2>")
      // link rel="stylesheet" type="text/css"
      .replace(/<link([^>]*)\stype=["']text\/css["']([^>]*)>/gi, "<link$1$2>");
  }
  if (html.indexOf("language=") !== -1) {
    // script language="javascript"
    html = html.replace(/<script([^>]*)\slanguage=["']javascript["']([^>]*)>/gi, "<script$1$2>");
  }
  if (html.indexOf("method=") !== -1) {
    // form method="get"
    html = html.replace(/<form([^>]*)\smethod=["']get["']([^>]*)>/gi, "<form$1$2>");
  }
  return html;
}

/**
 * Collapse boolean attributes:
 * disabled="disabled" -> disabled
 * checked="checked" -> checked
 * readonly="readonly" -> readonly
 */
const BOOL_ATTRS = ["disabled", "checked", "readonly", "selected", "multiple", "async", "defer", "autofocus", "autoplay", "controls", "hidden", "loop", "muted", "open", "required", "reversed", "scoped"];
// Precompiled once -- the old version built 34 RegExp objects on every call.
const BOOL_ATTR_SAME_RE = BOOL_ATTRS.map((a) => new RegExp(`\\s${a}=["']${a}["']`, "gi"));
const BOOL_ATTR_EMPTY_RE = BOOL_ATTRS.map((a) => new RegExp(`\\s${a}=["']["']`, "gi"));

function collapseBooleanAttrs(html: string): string {
  for (let i = 0; i < BOOL_ATTRS.length; i++) {
    // Cheap guard: skip the regex scan entirely when the attribute is absent
    // (the common case -- most documents use none of these).
    if (html.indexOf(BOOL_ATTRS[i]) === -1) continue;
    html = html.replace(BOOL_ATTR_SAME_RE[i], " " + BOOL_ATTRS[i]);
  }

  // Also handle disabled="" -> disabled
  for (let i = 0; i < BOOL_ATTRS.length; i++) {
    if (html.indexOf(BOOL_ATTRS[i]) === -1) continue;
    html = html.replace(BOOL_ATTR_EMPTY_RE[i], " " + BOOL_ATTRS[i]);
  }

  return html;
}

/**
 * Remove empty attributes: class="" -> (removed)
 * But keep alt="" (accessibility) and value="" (forms).
 */
function removeEmptyAttrs(html: string): string {
  const keepEmpty = new Set(["alt", "value", "src", "action"]);

  return html.replace(/\s([\w-]+)=["']["']/g, (match, attr) => {
    if (keepEmpty.has(attr.toLowerCase())) {
      return match;
    }
    return "";
  });
}

/**
 * Remove optional closing tags:
 * </li>, </td>, </th>, </tr>, </option>, </p>, </dt>, </dd>
 * (browsers auto-close these)
 *
 * Note: This is risky and can cause issues. Only enable if you know
 * the target environment handles it correctly.
 */
function removeOptionalTags(html: string): string {
  return html
    .replace(/<\/li>/gi, "")
    .replace(/<\/td>/gi, "")
    .replace(/<\/th>/gi, "")
    .replace(/<\/tr>/gi, "")
    .replace(/<\/option>/gi, "")
    .replace(/<\/dt>/gi, "")
    .replace(/<\/dd>/gi, "");
}

/**
 * Remove quotes around simple attribute values.
 * class="container" -> class=container
 * Only for values matching /^[a-zA-Z0-9_-]+$/
 */
function removeQuoteWrapping(html: string): string {
  return html.replace(/\s([\w-]+)=["']([a-zA-Z0-9_-]+)["']/g, " $1=$2");
}

// --- Stats ------------------------------------------------------------

export interface MinifyStats {
  originalSize: number;
  minifiedSize: number;
  saved: number;
  ratio: number;
}

/**
 * Minify HTML and return stats.
 */
export function minifyHTMLWithStats(html: string, options?: MinifyHTMLOptions): { html: string; stats: MinifyStats } {
  const originalSize = html.length;
  const minified = minifyHTML(html, options);
  const minifiedSize = minified.length;

  return {
    html: minified,
    stats: {
      originalSize,
      minifiedSize,
      saved: originalSize - minifiedSize,
      ratio: originalSize > 0 ? minifiedSize / originalSize : 1,
    },
  };
}
