/**
 * parallel-slots.ts -- Named-slot parsing/rendering for parallel routes,
 * plus a flat-array route matcher (as opposed to scanner.ts's tree-based
 * matchRoute, which matches against a scanned RouteNode tree).
 */

const SLOT_TAG_RE = /<slot\s+name=["']([^"']+)["']\s*\/?>(?:<\/slot>)?/gi;

/** Parse `<slot name="x" />` tags out of a layout string, in order of appearance. */
export function parseSlots(layout: string): string[] {
  const names: string[] = [];
  const re = new RegExp(SLOT_TAG_RE.source, SLOT_TAG_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(layout)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** Replace each named `<slot name="x" />` in a layout with its rendered content. */
export function renderParallel(layout: string, slots: Record<string, string>): string {
  const re = new RegExp(SLOT_TAG_RE.source, SLOT_TAG_RE.flags);
  return layout.replace(re, (_match, name) => slots[name] ?? "");
}

/** A flat route definition, as produced by a directory scan. */
export interface FlatRouteDefinition {
  path: string;
  file?: string;
  groups?: string[];
  dynamic?: boolean;
  params?: string[];
  catchAll?: boolean;
  [key: string]: unknown;
}

/** Result of matching a pathname against a flat list of route definitions. */
export interface FlatRouteMatch<R extends FlatRouteDefinition = FlatRouteDefinition> {
  route: R;
  params: Record<string, string>;
}

/**
 * Match a pathname against a flat array of route definitions (each with a
 * `path` like `/users/:id` or `/blog/*rest`). Static routes are tried first
 * implicitly by array order; the first matching route wins.
 */
export function matchFlatRoute<R extends FlatRouteDefinition = FlatRouteDefinition>(
  pathname: string,
  routes: R[],
): FlatRouteMatch<R> | null {
  const pathParts = pathname.split("/").filter(Boolean);

  for (const route of routes) {
    const routeParts = route.path.split("/").filter(Boolean);
    const params: Record<string, string> = {};
    let matched = true;
    let consumedAll = routeParts.length === pathParts.length;

    for (let i = 0; i < routeParts.length; i++) {
      const seg = routeParts[i];

      if (seg.startsWith(":")) {
        if (pathParts[i] === undefined) { matched = false; break; }
        params[seg.slice(1)] = pathParts[i];
        continue;
      }

      if (seg === "*" || seg.startsWith("*")) {
        const restName = seg.slice(1) || "rest";
        params[restName] = pathParts.slice(i).join("/");
        consumedAll = true;
        break;
      }

      if (pathParts[i] !== seg) { matched = false; break; }
    }

    if (matched && consumedAll) {
      return { route, params };
    }
  }

  return null;
}
