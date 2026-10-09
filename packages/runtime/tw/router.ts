/**
 * router.ts -- TW Framework runtime: client-side routing.
 *
 * Upgraded from the hardened19 baseline:
 *  - Replaced `any` with `unknown` + proper types throughout.
 *  - `routerLink` implemented as a function returning a VNode.
 *  - `routerView` implemented as a function rendering the current route component.
 *  - `useRouter` / `useRoute` are properly typed.
 *  - All existing exports preserved.
 */

import type { ComponentFactory, ComponentProps, VNode, VNodeChild } from './render';
import { h } from './render';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteQuery {
  readonly [key: string]: string | string[] | undefined;
}

export interface RouteParams {
  readonly [key: string]: string | undefined;
}

export interface RouteLocation {
  readonly path: string;
  readonly query: RouteQuery;
  readonly params: RouteParams;
  readonly hash: string;
  readonly fullPath: string;
  readonly name: string | symbol | undefined;
  readonly matched: readonly RouteRecord[];
}

export interface RouteRecord {
  path: string;
  name?: string;
  component?: ComponentFactory | (() => Promise<{ default: ComponentFactory }>);
  children?: RouteRecord[];
  redirect?: string;
  meta?: Record<string, unknown>;
  /** Named views: view name -> component. */
  components?: Record<string, ComponentFactory | (() => Promise<{ default: ComponentFactory }>)>;
  /** Path-to-regex compiled params. */
  _keys?: readonly { name: string; optional: boolean }[];
}

export interface RouterOptions {
  routes: RouteRecord[];
  /** Initial path (defaults to current location.pathname). */
  initial?: string;
  /** History mode. */
  mode?: 'history' | 'hash';
  /** Base URL prefix. */
  base?: string;
}

export type NavigationGuard = (
  to: RouteLocation,
  from: RouteLocation,
) => boolean | string | Promise<boolean | string>;

export interface NavigationResult {
  to: RouteLocation;
  from: RouteLocation;
  redirected?: boolean;
}

export interface Router {
  readonly currentRoute: RouteLocation;
  readonly options: RouterOptions;
  push(path: string): Promise<void>;
  replace(path: string): Promise<void>;
  go(delta: number): void;
  back(): void;
  forward(): void;
  beforeResolve(guard: NavigationGuard): () => void;
  beforeEach(guard: NavigationGuard): () => void;
  afterEach(hook: (to: RouteLocation, from: RouteLocation) => void): () => void;
  resolve(path: string): RouteLocation;
  /** Subscribe to route changes. */
  subscribe(listener: (route: RouteLocation) => void): () => void;
  /** Install into the app. */
  install(app: unknown): void;
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

interface CompiledRoute {
  record: RouteRecord;
  regex: RegExp;
  keys: { name: string; optional: boolean }[];
}

function compilePath(path: string, caseSensitive = false): CompiledRoute {
  const keys: { name: string; optional: boolean }[] = [];
  // Normalise trailing slash for matching, keep root.
  const normalised = path === '/' ? '/' : path.replace(/\/$/, '');
  const pattern = normalised
    .replace(/\/$/, '')
    .replace(/\/\*/g, '/(.*)')
    .replace(/:([^/]+)/g, (_m, param: string) => {
      const [name, mod] = param.split('?');
      const optional = mod === '?';
      keys.push({ name, optional });
      return optional ? `(?:([^/]+))?` : `([^/]+)`;
    });
  const regex = new RegExp(`^${pattern || '/'}$`, caseSensitive ? '' : 'i');
  return { record: { path, _keys: keys }, regex, keys };
}

function matchRoute(
  routes: RouteRecord[],
  path: string,
): { matched: RouteRecord[]; params: RouteParams } {
  for (const route of routes) {
    const compiled = compilePath(route.path);
    const m = compiled.regex.exec(path);
    if (m) {
      const params: Record<string, string | undefined> = {};
      compiled.keys.forEach((k, i) => {
        const val = m[i + 1];
        if (val !== undefined) params[k.name] = decodeURIComponent(val);
      });
      const matched = [{ ...route, _keys: compiled.keys }];
      // Check children with the remaining path.
      const remaining = path.slice(m[0].length);
      if (route.children && remaining) {
        const child = matchRoute(route.children, remaining || '/');
        if (child.matched.length) {
          return { matched: [...matched, ...child.matched], params: { ...params, ...child.params } as RouteParams };
        }
      }
      return { matched, params };
    }
  }
  return { matched: [], params: {} };
}

function parseQuery(search: string): RouteQuery {
  const query: Record<string, string | string[]> = {};
  const params = new URLSearchParams(search);
  for (const [key, value] of params.entries()) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  }
  return query;
}

function buildLocation(
  path: string,
  matched: RouteRecord[],
  params: RouteParams,
  search = '',
  hash = '',
): RouteLocation {
  const query = parseQuery(search);
  const fullName = matched.length ? matched[matched.length - 1]!.name : undefined;
  return {
    path,
    query,
    params,
    hash,
    fullPath: path + (search ? `?${search}` : '') + (hash || ''),
    name: fullName,
    matched,
  };
}

// ---------------------------------------------------------------------------
// Router implementation
// ---------------------------------------------------------------------------

export function createRouter(options: RouterOptions): Router {
  const routes = options.routes;
  const mode = options.mode ?? 'history';
  const base = options.base ?? '';

  const guards: NavigationGuard[] = [];
  const afterHooks: ((to: RouteLocation, from: RouteLocation) => void)[] = [];
  const listeners: ((route: RouteLocation) => void)[] = [];

  const initialPath =
    options.initial ??
    (typeof window !== 'undefined'
      ? mode === 'hash'
        ? window.location.hash.slice(1) || '/'
        : window.location.pathname.slice(base.length) || '/'
      : '/');

  const initial = resolve(initialPath);
  let current: RouteLocation = initial;

  function resolve(path: string): RouteLocation {
    const [pathPart, searchPart = '', hashPart = ''] = path.split(/(?=[?#])/);
    const cleanPath = pathPart || '/';
    const { matched, params } = matchRoute(routes, cleanPath);
    const search = searchPart.startsWith('?') ? searchPart.slice(1) : '';
    const hash = hashPart.startsWith('#') ? hashPart : '';
    return buildLocation(cleanPath, matched, params, search, hash);
  }

  async function runGuards(to: RouteLocation, from: RouteLocation): Promise<boolean> {
    for (const guard of guards) {
      const result = await guard(to, from);
      if (result === false) return false;
      if (typeof result === 'string') {
        await push(result);
        return false;
      }
    }
    return true;
  }

  async function push(path: string): Promise<void> {
    const to = resolve(path);
    const ok = await runGuards(to, current);
    if (!ok) return;
    const from = current;
    current = to;
    if (typeof window !== 'undefined' && mode === 'history') {
      window.history.pushState({}, '', (base || '') + to.fullPath);
    } else if (typeof window !== 'undefined' && mode === 'hash') {
      window.location.hash = to.fullPath;
    }
    for (const hook of afterHooks) hook(to, from);
    for (const listener of listeners) listener(to);
  }

  async function replace(path: string): Promise<void> {
    const to = resolve(path);
    const ok = await runGuards(to, current);
    if (!ok) return;
    const from = current;
    current = to;
    if (typeof window !== 'undefined' && mode === 'history') {
      window.history.replaceState({}, '', (base || '') + to.fullPath);
    } else if (typeof window !== 'undefined' && mode === 'hash') {
      window.location.hash = to.fullPath;
    }
    for (const hook of afterHooks) hook(to, from);
    for (const listener of listeners) listener(to);
  }

  function go(delta: number): void {
    if (typeof window !== 'undefined') window.history.go(delta);
  }
  function back(): void {
    go(-1);
  }
  function forward(): void {
    go(1);
  }

  function beforeEach(guard: NavigationGuard): () => void {
    guards.push(guard);
    return () => {
      const i = guards.indexOf(guard);
      if (i >= 0) guards.splice(i, 1);
    };
  }
  const beforeResolve = beforeEach;
  function afterEach(hook: (to: RouteLocation, from: RouteLocation) => void): () => void {
    afterHooks.push(hook);
    return () => {
      const i = afterHooks.indexOf(hook);
      if (i >= 0) afterHooks.splice(i, 1);
    };
  }
  function subscribe(listener: (route: RouteLocation) => void): () => void {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function install(app: unknown): void {
    const appObj = app as { provide?: (key: unknown, value: unknown) => void; config?: { globalProperties?: Record<string, unknown> } };
    if (appObj.provide) appObj.provide('router', routerInstance);
    if (appObj.config?.globalProperties) {
      appObj.config.globalProperties.$router = routerInstance;
      appObj.config.globalProperties.$route = current;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        const path =
          mode === 'hash'
            ? window.location.hash.slice(1) || '/'
            : window.location.pathname.slice(base.length) || '/';
        const next = resolve(path);
        const from = current;
        current = next;
        for (const listener of listeners) listener(next);
        void from;
      });
    }
  }

  const routerInstance: Router = {
    get currentRoute() {
      return current;
    },
    options,
    push,
    replace,
    go,
    back,
    forward,
    beforeResolve,
    beforeEach,
    afterEach,
    resolve,
    subscribe,
    install,
  };

  return routerInstance;
}

// ---------------------------------------------------------------------------
// useRouter / useRoute
// ---------------------------------------------------------------------------

let activeRouter: Router | null = null;

export function setRouter(router: Router): void {
  activeRouter = router;
}

/**
 * Access the active router instance. Throws if no router has been installed
 * (i.e. called outside an app with routing configured).
 */
export function useRouter(): Router {
  if (activeRouter === null) {
    throw new Error(
      'useRouter() was called but no router is active. Call setRouter(router) ' +
        'or install the router into your app before using useRouter().',
    );
  }
  return activeRouter;
}

/**
 * Access the current route location. Throws if no router is active.
 */
export function useRoute(): RouteLocation {
  return useRouter().currentRoute;
}

// ---------------------------------------------------------------------------
// Navigation hooks (docs/navigation-hooks.md)
//
// Next.js gives you usePathname / useSearchParams / useParams /
// useSelectedLayoutSegment as four read-only imports. These do the same job
// with the parsing built in, and useSearchParams can *write*.
// ---------------------------------------------------------------------------

export interface PathnameMatch {
  matches: boolean;
  /** The [param] values the pattern bound, when it matched. */
  params: Record<string, string>;
  /** 0-1: how specific the match was (more literal segments scores higher). */
  score: number;
}

/** The current path, or a pattern match against it. */
export function usePathname(opts?: { pattern: string }): string | PathnameMatch {
  const path = useRouter().currentRoute.path;
  if (!opts) return path;
  return matchPathPattern(path, opts.pattern);
}

/** Match `/blog/[slug]` (or `/blog/:slug`) against a concrete path. */
export function matchPathPattern(path: string, pattern: string): PathnameMatch {
  const pSeg = path.split("/").filter(Boolean);
  const tSeg = pattern.split("/").filter(Boolean);
  if (pSeg.length !== tSeg.length) return { matches: false, params: {}, score: 0 };

  const params: Record<string, string> = {};
  let literal = 0;
  for (let i = 0; i < tSeg.length; i++) {
    const t = tSeg[i];
    const isParam = (t.startsWith("[") && t.endsWith("]")) || t.startsWith(":");
    if (isParam) {
      const name = t.startsWith("[") ? t.slice(1, -1).replace(/\.\.\.$/, "") : t.slice(1);
      params[name] = decodeURIComponent(pSeg[i]);
    } else if (t !== pSeg[i]) {
      return { matches: false, params: {}, score: 0 };
    } else {
      literal++;
    }
  }
  return { matches: true, params, score: tSeg.length === 0 ? 1 : literal / tSeg.length };
}

export type ParamParse = "string" | "int" | "float" | "bool" | "json" | "date";

function coerce(value: string | undefined, parse: ParamParse): unknown {
  if (value === undefined) return undefined;
  switch (parse) {
    case "int": { const n = Number.parseInt(value, 10); return Number.isNaN(n) ? undefined : n; }
    case "float": { const n = Number.parseFloat(value); return Number.isNaN(n) ? undefined : n; }
    case "bool": return value === "1" || value.toLowerCase() === "true";
    case "json": { try { return JSON.parse(value); } catch { return undefined; } }
    case "date": { const d = new Date(value); return Number.isNaN(d.getTime()) ? undefined : d; }
    default: return value;
  }
}

/** Route params. `useParams()` for all, `useParam()` for one, with coercion. */
export function useParams(): Record<string, string> {
  return { ...(useRouter().currentRoute.params as Record<string, string>) };
}

export function useParam<T = string>(key: string, opts?: { parse?: ParamParse }): T | undefined {
  const raw = (useRouter().currentRoute.params as Record<string, string>)[key];
  return coerce(raw, opts?.parse ?? "string") as T | undefined;
}

export function useParamInt(key: string): number | undefined { return useParam<number>(key, { parse: "int" }); }
export function useParamBool(key: string): boolean | undefined { return useParam<boolean>(key, { parse: "bool" }); }
export function useParamList(key: string): string[] {
  const raw = (useRouter().currentRoute.params as Record<string, string>)[key];
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export interface SearchParamsHandle {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  keys(): string[];
  entries(): Array<[string, string]>;
  toString(): string;
  /** Replace a value and update the URL. */
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  toggle(name: string, value?: string): void;
  /** Stage several values at once -- cleaner than a run of set() calls. */
  update(values: Record<string, string | number | boolean | null | undefined | Array<string | number>>): void;
  /** Push all pending changes to the router. */
  commit(): Promise<void>;
}

/** The query string, readable *and writable*. */
export function useSearchParams(): SearchParamsHandle {
  const router = useRouter();
  const current = () => (router.currentRoute.query ?? {}) as Record<string, string | string[]>;
  const flat = (): Array<[string, string]> => {
    const out: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(current())) {
      if (Array.isArray(v)) for (const item of v) out.push([k, item]);
      else if (v !== undefined) out.push([k, String(v)]);
    }
    return out;
  };
  const pending = new Map<string, string[]>();

  const build = (): string => {
    const base = new Map<string, string[]>();
    for (const [k, v] of flat()) {
      const list = base.get(k) ?? []; list.push(v); base.set(k, list);
    }
    for (const [k, v] of pending) base.set(k, v);
    const qs = new URLSearchParams();
    for (const [k, list] of base) for (const v of list) qs.append(k, v);
    return qs.toString();
  };

  return {
    get: (n) => (pending.has(n) ? pending.get(n)![0] ?? null : (() => { const v = current()[n]; return v === undefined ? null : Array.isArray(v) ? v[0] ?? null : String(v); })()),
    getAll: (n) => (pending.has(n) ? [...pending.get(n)!] : (() => { const v = current()[n]; return v === undefined ? [] : Array.isArray(v) ? [...v] : [String(v)]; })()),
    has: (n) => pending.has(n) ? pending.get(n)!.length > 0 : current()[n] !== undefined,
    keys: () => [...new Set([...flat().map(([k]) => k), ...pending.keys()])],
    entries: () => { const qs = new URLSearchParams(build()); return [...qs.entries()]; },
    toString: () => build(),
    set: (n, v) => { pending.set(n, [v]); },
    append: (n, v) => { pending.set(n, [...(pending.get(n) ?? []), v]); },
    delete: (n) => { pending.set(n, []); },
    toggle: (n, v = "1") => { const cur = pending.get(n) ?? (current()[n] !== undefined ? [String(current()[n])] : []); pending.set(n, cur.includes(v) ? [] : [v]); },
    update: (values) => {
      for (const [k, v] of Object.entries(values)) {
        if (v === null || v === undefined) { pending.set(k, []); continue; }
        pending.set(k, Array.isArray(v) ? v.map(String) : [String(v)]);
      }
    },
    commit: async () => {
      const qs = build();
      const { path, hash } = router.currentRoute;
      await router.push(qs ? `${path}?${qs}${hash || ""}` : `${path}${hash || ""}`);
      pending.clear();
    },
  };
}

export interface RouteSegment {
  value: string;
  index: number;
  isDynamic: boolean;
  /** The param name this segment binds to, when dynamic. */
  param?: string;
  type: "static" | "dynamic" | "group" | "catch-all";
}

export interface RouteSegmentsInfo {
  path: string;
  segments: RouteSegment[];
  /** Route groups -- `(marketing)` style -- which do not appear in the URL. */
  groups: string[];
  /** True when `href` is the current route or an ancestor of it. */
  isActive(href: string, opts?: { exact?: boolean }): boolean;
}

/** The segment tree, with types and an `isActive` helper. */
export function useRouteSegments(): RouteSegmentsInfo {
  const router = useRouter();
  const path = router.currentRoute.path;
  const raw = path.split("/").filter(Boolean);

  const segments: RouteSegment[] = raw.map((value, index) => {
    if (value.startsWith("(") && value.endsWith(")")) {
      return { value, index, isDynamic: false, type: "group" as const };
    }
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(value) ?? /^\*(.+)$/.exec(value);
    if (catchAll) return { value, index, isDynamic: true, param: catchAll[1], type: "catch-all" as const };
    const dyn = /^\[(.+)\]$/.exec(value) ?? /^:(.+)$/.exec(value);
    if (dyn) return { value, index, isDynamic: true, param: dyn[1], type: "dynamic" as const };
    return { value, index, isDynamic: false, type: "static" as const };
  });

  const groups = segments.filter((s) => s.type === "group").map((s) => s.value.slice(1, -1));

  return {
    path,
    segments: segments.filter((s) => s.type !== "group"),
    groups,
    isActive(href: string, opts?: { exact?: boolean }) {
      const target = href.split("?")[0].replace(/\/$/, "") || "/";
      const here = path.replace(/\/$/, "") || "/";
      if (opts?.exact) return here === target;
      if (target === "/") return here === "/";
      return here === target || here.startsWith(target + "/");
    },
  };
}

// ---------------------------------------------------------------------------
// routerLink -- a function returning a VNode
// ---------------------------------------------------------------------------

export interface RouterLinkProps extends ComponentProps {
  to: string | RouteLocation;
  activeClass?: string;
  exactActiveClass?: string;
  custom?: boolean;
}

/**
 * Render a navigation link (`<a>`) that triggers client-side routing via
 * `router.push`. Respects the `custom` prop (render children only, no `<a>`).
 */
export function routerLink(props: RouterLinkProps): VNode | null {
  const router = activeRouter ?? null;
  const children = (props.children ?? []) as VNodeChild[];
  if (!router) {
    // No router: render a plain anchor so SSR still produces valid markup.
    const href = typeof props.to === 'string' ? props.to : props.to.fullPath;
    return h('a', { href }, ...children);
  }

  const target = typeof props.to === 'string' ? router.resolve(props.to) : props.to;
  const href = target.fullPath;
  const isExact = router.currentRoute.path === target.path;
  const isActive =
    isExact || router.currentRoute.path.startsWith(target.path + '/');

  const onClick = (event: unknown) => {
    const ev = event as { preventDefault?: () => void; metaKey?: boolean; ctrlKey?: boolean; button?: number };
    if (ev && typeof ev.preventDefault === 'function') {
      // Only intercept plain left-clicks.
      if (ev.metaKey || ev.ctrlKey || ev.button !== 0) return;
      ev.preventDefault();
      void router.push(href);
    }
  };

  if (props.custom) {
    return h('fragment', null, ...children);
  }

  const className = [
    typeof props.class === 'string' ? props.class : '',
    isActive ? (props.activeClass ?? 'router-link-active') : '',
    isExact ? (props.exactActiveClass ?? 'router-link-exact-active') : '',
  ]
    .filter(Boolean)
    .join(' ');

  return h('a', { href, class: className, onClick }, ...children);
}

// ---------------------------------------------------------------------------
// routerView -- renders the current matched route component
// ---------------------------------------------------------------------------

export interface RouterViewProps extends ComponentProps {
  /** Named view slot (defaults to 'default'). */
  name?: string;
}

/** Cache of already-resolved async component factories. */
const componentCache = new WeakMap<ComponentFactory, ComponentFactory>();

async function resolveComponent(
  loader: ComponentFactory | (() => Promise<{ default: ComponentFactory }>),
): Promise<ComponentFactory> {
  if (typeof loader !== 'function') return loader;
  // Distinguish a plain component fn from an async loader by checking the
  // function's arity/name heuristically. An async loader returns a Promise.
  const cached = componentCache.get(loader as ComponentFactory);
  if (cached) return cached;

  const result = (loader as () => unknown)();
  if (result instanceof Promise) {
    const mod = await (result as Promise<{ default: ComponentFactory }>);
    componentCache.set(loader as ComponentFactory, mod.default);
    return mod.default;
  }
  // It was a plain component factory after all.
  return loader as ComponentFactory;
}

/**
 * Render the component matched by the current route. Supports named views and
 * async (lazy) route components. During SSR, renders the resolved component.
 */
export function routerView(props?: RouterViewProps): VNode | null {
  const router = activeRouter ?? null;
  if (!router) return null;

  const matched = router.currentRoute.matched;
  if (matched.length === 0) return null;

  const name = props?.name ?? 'default';
  // Use the deepest matched record that defines the requested view.
  const record = [...matched].reverse().find((r) => {
    if (r.components && r.components[name]) return true;
    if (name === 'default' && r.component) return true;
    return false;
  });
  if (!record) return null;

  const loader =
    name === 'default'
      ? (record.components?.default ?? record.component)
      : record.components?.[name];
  if (!loader) return null;

  // Resolve synchronously when possible; for async loaders render nothing in
  // SSR (the stream will await them) and a placeholder on the client.
  const result = (loader as () => unknown)();
  if (result instanceof Promise) {
    // In a streaming context the promise is awaited; here return a comment
    // marker so the output is well-formed.
    return h('div', { class: 'router-view-loading', 'data-tw-pending': name }) as VNode;
  }

  const Component = result as ComponentFactory;
  const routeProps: ComponentProps = {
    ...(props ?? {}),
    route: router.currentRoute,
  };
  delete routeProps.name;
  delete routeProps.children;
  return h(Component, routeProps);
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

export function navigate(path: string): Promise<void> {
  return useRouter().push(path);
}

/** Programmatic redirect helper. */
export function redirectTo(path: string): Promise<void> {
  return useRouter().replace(path);
}


