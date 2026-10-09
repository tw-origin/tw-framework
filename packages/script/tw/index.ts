/**
 * @tw/Script — the TW Framework script loader.
 *
 * Next's `<Script>` gives you three strategies
 * (`beforeInteractive`, `afterInteractive`, `lazyOnload`). TW adds two more —
 * `worker` (runs off the main thread) and `idle` (waits for
 * `requestIdleCallback`) — and bakes in subresource integrity and a CSP nonce,
 * which Next's component cannot do.
 *
 * The tag compiles to plain HTML plus a `data-tw-strategy` marker the runtime
 * already understands. Nothing from this package ships to the browser.
 */

export type ScriptStrategy =
  | "beforeInteractive"
  | "afterInteractive"
  | "lazyOnload"
  | "worker"
  | "idle";

export const SCRIPT_STRATEGIES: ScriptStrategy[] = [
  "beforeInteractive", "afterInteractive", "lazyOnload", "worker", "idle",
];

export interface ScriptOptions {
  src?: string;
  /** Inline body -- used when there is no `src`. */
  inline?: string;
  strategy?: ScriptStrategy;
  /** Subresource integrity hash, e.g. "sha384-...". */
  sri?: string;
  /** CSP nonce. */
  nonce?: string;
  type?: string;
  id?: string;
  async?: boolean;
  defer?: boolean;
  crossOrigin?: string;
  referrerPolicy?: string;
  /** Only load once, even if the component renders again. */
  once?: boolean;
}

/** Is this a strategy we know? */
export function isScriptStrategy(v: string): v is ScriptStrategy {
  return (SCRIPT_STRATEGIES as string[]).includes(v);
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The attributes for a script tag.
 *
 * `defer` is implied by every strategy except `beforeInteractive`, which the
 * browser must see while parsing. `worker` and `idle` are marked so the runtime
 * can pick them up.
 */
export function scriptAttributesFor(opts: ScriptOptions): Record<string, string> {
  const strategy: ScriptStrategy = opts.strategy ?? "afterInteractive";
  const attrs: Record<string, string> = {};

  if (opts.src) attrs.src = opts.src;
  attrs["data-tw-strategy"] = strategy;

  // beforeInteractive must not defer -- it has to run during parse.
  if (strategy === "beforeInteractive") {
    if (opts.defer) attrs.defer = "";
  } else {
    attrs.defer = "";
  }
  if (opts.async) attrs.async = "";
  if (opts.type) attrs.type = opts.type;

  if (opts.sri) {
    attrs.integrity = opts.sri;
    // integrity is meaningless without a cross-origin policy
    attrs.crossorigin = opts.crossOrigin ?? "anonymous";
  } else if (opts.crossOrigin) {
    attrs.crossorigin = opts.crossOrigin;
  }
  if (opts.nonce) attrs.nonce = opts.nonce;
  if (opts.referrerPolicy) attrs.referrerpolicy = opts.referrerPolicy;
  if (opts.id) attrs.id = opts.id;
  if (opts.once) attrs["data-tw-once"] = "";

  return attrs;
}

/** The full `<script>` tag. */
export function renderScript(opts: ScriptOptions): string {
  const attrs = scriptAttributesFor(opts);
  const parts = Object.entries(attrs).map(([k, v]) => (v === "" ? k : `${k}="${esc(v)}"`));
  const body = opts.src ? "" : esc(opts.inline ?? "");
  return `<script ${parts.join(" ")}>${body}</script>`;
}
