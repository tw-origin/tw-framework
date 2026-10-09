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
  render: (props: Record<string, string>, childrenHtml: string) => string;
}

const registry = new Map<string, ForeignComponent>();

export function registerForeignComponent(name: string, entry: ForeignComponent): void { registry.set(name, entry); }
export function resolveForeignComponent(name: string): ForeignComponent | null { return registry.get(name) ?? null; }
export function hasForeignComponents(): boolean { return registry.size > 0; }
export function clearForeignComponents(): void { registry.clear(); }
export function foreignComponentNames(): string[] { return [...registry.keys()]; }

export function islandWrapper(name: string, propsJson: string, html: string, src?: string): string {
  const srcAttr = src ? ` data-tw-src="${src}"` : "";
  return (
    `<tw-island data-tw-island="${name}"` +
    ` data-tw-props="${escapeAttr(propsJson)}"${srcAttr}` +
    ` style="display:contents">${html}</tw-island>`
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
