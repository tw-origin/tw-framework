/**
 * Foreign component registry (strategies.render.engine = "react" | "preact").
 * A foreign component is a .tsx / .jsx file a .tw page imports and uses as a
 * tag. The build renders it to HTML once and registers the renderer here; the
 * compiler calls it and wraps the output in a hydrateable island.
 * Nothing is registered by default, so a project without one compiles as before.
 */

export interface ForeignComponent {
  engine: "react" | "preact";
  source?: string;
  chunkUrl?: string;
  /** From the component's `@client:*` directive. "visible" defers the download. */
  strategy?: "eager" | "lazy" | "visible";
  render: (props: Record<string, string>, childrenHtml: string) => string;
}

const registry = new Map<string, ForeignComponent>();
/** Every specifier seen for a component name, so ambiguity can be detected. */
const nameSpecifiers = new Map<string, Set<string>>();

/**
 * A name alone is not an identity: two components in different folders can both
 * default-export `Counter`, and two pages can import each of them under the same
 * local name. The import specifier is what tells them apart, so the registry is
 * keyed by both.
 */
function key(name: string, specifier: string): string { return name + "\u0000" + specifier; }

export function registerForeignComponent(name: string, specifier: string, entry: ForeignComponent): void {
  registry.set(key(name, specifier), entry);
  let specs = nameSpecifiers.get(name);
  if (!specs) { specs = new Set(); nameSpecifiers.set(name, specs); }
  specs.add(specifier);
}

export function resolveForeignComponent(name: string, specifier?: string): ForeignComponent | null {
  if (specifier) {
    const exact = registry.get(key(name, specifier));
    if (exact) return exact;
  }
  // A name-only lookup is only trustworthy while the name is unambiguous. Once
  // two files share a name, handing back either one would be a silent wrong
  // render, so the name-only entry is dropped and this returns null -- the
  // caller must ask by specifier, and an unknown tag is reported as unknown
  // rather than rendered with the wrong component.
  const specs = nameSpecifiers.get(name);
  if (specs && specs.size === 1) {
    return registry.get(key(name, [...specs][0])) ?? null;
  }
  return null;
}

export function hasForeignComponents(): boolean { return registry.size > 0; }
export function clearForeignComponents(): void { registry.clear(); nameSpecifiers.clear(); }
export function foreignComponentNames(): string[] {
  const names = new Set<string>();
  for (const k of registry.keys()) names.add(k.includes("\u0000") ? k.split("\u0000")[0] : k);
  return [...names];
}

export function islandWrapper(name: string, propsJson: string, html: string, src?: string, defer?: boolean): string {
  // A deferred island keeps its chunk URL but under a different attribute, so the
  // eager script collector does not pick it up. A small loader fetches it when
  // the island scrolls into view.
  const srcAttr = !src ? "" : defer ? ` data-tw-defer-src="${src}" data-tw-defer="visible"` : ` data-tw-src="${src}"`;
  return (
    `<tw-island data-tw-island="${name}"` +
    ` data-tw-props="${escapeAttr(propsJson)}"${srcAttr}` +
    ` style="display:contents">${html}</tw-island>`
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
