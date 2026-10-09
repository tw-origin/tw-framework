/**
 * @tw/Form — the TW Framework form component.
 *
 * Next's `next/form` assumes JavaScript: it prefetches and intercepts, and a
 * plain HTML POST is the fallback you get by accident. TW's form is the other
 * way round — it emits a real `<form>` that submits correctly with JS off, and
 * marks itself so the runtime can upgrade it when JS is available.
 *
 * The tag compiles to plain HTML. Nothing from this package ships to the browser.
 */

export interface FormOptions {
  /** Where to submit. Omit for the current URL. */
  action?: string;
  /** GET or POST. Defaults to GET. */
  method?: "GET" | "POST" | "get" | "post";
  /** Opt out of the JS upgrade — always a full-page submit. */
  native?: boolean;
  id?: string;
  class?: string;
  name?: string;
  /** `multipart/form-data` for file uploads. */
  enctype?: string;
  /** Skip HTML5 validation. */
  noValidate?: boolean;
  target?: string;
  /** Name of the field that carries the submitter's intent. */
  submitName?: string;
  /** Autocomplete behaviour for the whole form. */
  autoComplete?: string;
}

/** The attributes for the `<form>` tag. */
export function formAttributesFor(opts: FormOptions = {}): Record<string, string> {
  const attrs: Record<string, string> = {};
  const method = (opts.method ?? "GET").toUpperCase();

  attrs.method = method;
  if (opts.action) attrs.action = opts.action;
  if (opts.id) attrs.id = opts.id;
  if (opts.class) attrs.class = opts.class;
  if (opts.name) attrs.name = opts.name;
  if (opts.enctype) attrs.enctype = opts.enctype;
  if (opts.target) attrs.target = opts.target;
  if (opts.autoComplete) attrs.autocomplete = opts.autoComplete;
  if (opts.noValidate) attrs.novalidate = "";

  // Progressive enhancement: the form is fully functional without this.
  // The runtime upgrades a `data-tw-form` form to a fetch submit when JS runs.
  if (!opts.native) attrs["data-tw-form"] = "";
  if (opts.submitName) attrs["data-tw-submit-name"] = opts.submitName;

  return attrs;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The full `<form>` element with its children inside. */
export function renderForm(opts: FormOptions, children = ""): string {
  const attrs = formAttributesFor(opts);
  const parts = Object.entries(attrs).map(([k, v]) => (v === "" ? k : `${k}="${esc(v)}"`));
  return `<form ${parts.join(" ")}>${children}</form>`;
}

/**
 * A form field, with its label and error slot -- the three things every form
 * repeats. `error` renders an `aria-live` region so screen readers announce it.
 */
export interface FieldOptions {
  name: string;
  type?: string;
  label?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  id?: string;
}

export function renderField(opts: FieldOptions): string {
  const id = opts.id ?? `f-${opts.name}`;
  const errId = `${id}-err`;
  const inputAttrs: string[] = [
    `id="${esc(id)}"`,
    `name="${esc(opts.name)}"`,
    `type="${esc(opts.type ?? "text")}"`,
  ];
  if (opts.value !== undefined) inputAttrs.push(`value="${esc(opts.value)}"`);
  if (opts.placeholder) inputAttrs.push(`placeholder="${esc(opts.placeholder)}"`);
  if (opts.required) inputAttrs.push("required");
  if (opts.error) { inputAttrs.push("aria-invalid=\"true\""); inputAttrs.push(`aria-describedby="${esc(errId)}"`); }

  const label = opts.label ? `<label for="${esc(id)}">${esc(opts.label)}</label>` : "";
  const error = opts.error
    ? `<p id="${esc(errId)}" role="alert" aria-live="polite">${esc(opts.error)}</p>`
    : "";

  return `${label}<input ${inputAttrs.join(" ")}>${error}`;
}
