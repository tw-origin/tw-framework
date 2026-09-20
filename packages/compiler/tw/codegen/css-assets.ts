/**
 * Production CSS asset computation (see docs: production css output model).
 *
 * Input: per-route chunk ids captured by the compiler (content-deduped).
 * Output: the set of files to write and, per route, the <link> tags to
 * inject (or the css to inline as critical styles when the route's total
 * stylesheet is small enough that a separate request would cost more
 * than it saves).
 *
 * Splitting rules:
 *  - chunks used by 2+ routes -> one shared `common.<hash>.css` (no css is
 *    ever duplicated across output files)
 *  - chunks used by one route -> `<route>.<hash>.css`
 *  - route "/" is named `app` (app.<hash>.css)
 */

/** Inline (critical) instead of linking when a route's total css is <= this. */
export const CRITICAL_CSS_INLINE_LIMIT = 200;

export interface CssFile {
  /** File name, e.g. `common.a82f31.css` */
  name: string;
  css: string;
}

export interface RouteCssPlan {
  /** hrefs to link, in order (common first) */
  links: string[];
  /** when set, inline this css as critical <style> instead of linking */
  inline: string | null;
  routeName: string;
}

export interface CssAssetPlan {
  files: CssFile[];
  routes: Map<string, RouteCssPlan>;
}

/** routePath ("/", "/about", "/catalog/[slug]") -> output base name */
export function routeToCssName(route: string): string {
  if (route === "/" || route === "") return "app";
  return route.slice(1).replace(/\//g, ".").replace(/\[|\]/g, "");
}

/**
 * @param routes Map<routePath, chunkIds[]> (from getCapturedCssRoutes)
 * @param chunkCss Map<chunkId, css> resolver
 */
export function computeCssAssets(
  routes: Map<string, string[]>,
  chunkCss: (id: string) => string | undefined,
): CssAssetPlan {
  // how many routes use each chunk
  const usage = new Map<string, number>();
  for (const ids of routes.values()) {
    for (const id of new Set(ids)) usage.set(id, (usage.get(id) ?? 0) + 1);
  }
  const routeCount = routes.size;

  const commonIds: string[] = [];
  const routeIds = new Map<string, string[]>();
  for (const [route, ids] of routes) {
    const own: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (routeCount >= 2 && (usage.get(id) ?? 0) >= 2) commonIds.push(id);
      else own.push(id);
    }
    routeIds.set(route, own);
  }

  const files: CssFile[] = [];
  const plans = new Map<string, RouteCssPlan>();
  const fileFor = (base: string, css: string): string => {
    const h = hashCssPublic(css);
    const name = `${base}.${h}.css`;
    if (!files.some(f => f.name === name)) files.push({ name, css });
    return name;
  };

  const commonCss = dedupe(commonIds.map(chunkCss).filter(Boolean) as string[]).join("\n");
  const commonName = commonCss ? fileFor("common", commonCss) : null;

  for (const [route, ids] of routeIds) {
    const routeName = routeToCssName(route);
    const ownCss = dedupe(ids.map(chunkCss).filter(Boolean) as string[]).join("\n");
    const total = (commonCss ? commonCss.length : 0) + ownCss.length;
    if (total > 0 && total <= CRITICAL_CSS_INLINE_LIMIT) {
      plans.set(route, { links: [], inline: (commonCss ? commonCss + "\n" : "") + ownCss, routeName });
      continue;
    }
    const links: string[] = [];
    if (commonName) links.push(`/assets/${commonName}`);
    if (ownCss) links.push(`/assets/${fileFor(routeName, ownCss)}`);
    plans.set(route, { links, inline: null, routeName });
  }
  return { files, routes: plans };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function hashCssPublic(css: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < css.length; i++) {
    h1 = ((h1 ^ css.charCodeAt(i)) * 16777619) | 0;
    h2 = ((h2 + css.charCodeAt(i) * (i + 7)) * 2654435761) | 0;
  }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(8, "0").slice(0, 8);
}
