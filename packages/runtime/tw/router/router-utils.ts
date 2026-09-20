/**
 * Router utilities -- route matching, navigation guards, history management.
 * @module runtime/router
 */

export interface Route {
  path: string;
  name?: string;
  component?: unknown;
  redirect?: string;
  children?: Route[];
  meta?: Record<string, unknown>;
  props?: Record<string, unknown> | boolean;
  alias?: string | string[];
  caseSensitive?: boolean;
  beforeEnter?: (to: Route, from: Route) => boolean | string | Promise<boolean | string>;
}

export interface RouteMatch {
  route: Route;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  hash: string;
  matched: Route[];
  meta: Record<string, unknown>;
}

export interface NavigationGuard {
  (to: RouteMatch, from: RouteMatch): boolean | string | Route | Promise<boolean | string | Route>;
}

export interface RouteRecord {
  path: string;
  name?: string;
  component?: unknown;
  redirect?: string;
  meta?: Record<string, unknown>;
  children?: RouteRecord[];
  beforeEnter?: (to: RouteMatch, from: RouteMatch) => boolean | string | Promise<boolean | string>;
  alias?: string | string[];
  caseSensitive?: boolean;
  props?: Record<string, unknown> | boolean;
}

export class RouteMatcher {
  private routes: Route[] = [];
  private routeMap: Map<string, Route> = new Map();
  private dynamicRoutes: Array<{ pattern: string; regex: RegExp; paramNames: string[]; route: Route }> = [];

  addRoute(route: Route): this {
    this.routes.push(route);
    if (route.name) {
      this.routeMap.set(route.name, route);
    }
    const { regex, paramNames } = this.compilePath(route.path, route.caseSensitive);
    this.dynamicRoutes.push({ pattern: route.path, regex, paramNames, route });
    if (route.children) {
      for (const child of route.children) {
        const childPath = this.joinPaths(route.path, child.path);
        this.addRoute({ ...child, path: childPath });
      }
    }
    if (route.alias) {
      const aliases = Array.isArray(route.alias) ? route.alias : [route.alias];
      for (const alias of aliases) {
        const { regex: aliasRegex, paramNames: aliasParamNames } = this.compilePath(alias, route.caseSensitive);
        this.dynamicRoutes.push({ pattern: alias, regex: aliasRegex, paramNames: aliasParamNames, route });
      }
    }
    return this;
  }

  removeRoute(path: string): this {
    this.routes = this.routes.filter((r) => r.path !== path);
    this.dynamicRoutes = this.dynamicRoutes.filter((dr) => dr.pattern !== path);
    return this;
  }

  clearRoutes(): this {
    this.routes = [];
    this.routeMap.clear();
    this.dynamicRoutes = [];
    return this;
  }

  match(path: string): RouteMatch | null {
    const { pathname, search, hash } = this.parseURL(path);
    for (const { regex, paramNames, route } of this.dynamicRoutes) {
      const match = regex.exec(pathname);
      if (match) {
        const params: Record<string, string> = {};
        paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1] ?? "");
        });
        const query = this.parseQuery(search);
        const matched = this.getMatchedChain(route);
        return {
          route,
          path: pathname,
          params,
          query,
          hash: hash.startsWith("#") ? hash.slice(1) : hash,
          matched,
          meta: this.collectMeta(matched),
        };
      }
    }
    return null;
  }

  getRouteByName(name: string): Route | undefined {
    return this.routeMap.get(name);
  }

  getRoutes(): Route[] {
    return [...this.routes];
  }

  getRouteCount(): number {
    return this.routes.length;
  }

  hasRoute(path: string): boolean {
    return this.routes.some((r) => r.path === path);
  }

  private compilePath(path: string, caseSensitive?: boolean): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    let pattern = path.replace(/\?/g, "\\?");
    pattern = pattern.replace(/\*/g, ".*");
    pattern = pattern.replace(/\:([a-zA-Z_][a-zA-Z0-9_]*)(\([^)]+\))?/g, (_, paramName, pattern) => {
      paramNames.push(paramName);
      if (pattern) {
        return `(${pattern.slice(1, -1)})`;
      }
      return "([^/]+)";
    });
    pattern = pattern.replace(/\(/g, "(").replace(/\)/g, ")");
    pattern = "^" + pattern + "$";
    return { regex: new RegExp(pattern, caseSensitive ? "" : "i"), paramNames };
  }

  private joinPaths(parent: string, child: string): string {
    if (child.startsWith("/")) return child;
    if (parent.endsWith("/")) return parent + child;
    return parent + "/" + child;
  }

  private parseURL(url: string): { pathname: string; search: string; hash: string } {
    let pathname = url;
    let search = "";
    let hash = "";
    const hashIndex = pathname.indexOf("#");
    if (hashIndex !== -1) {
      hash = pathname.slice(hashIndex);
      pathname = pathname.slice(0, hashIndex);
    }
    const searchIndex = pathname.indexOf("?");
    if (searchIndex !== -1) {
      search = pathname.slice(searchIndex);
      pathname = pathname.slice(0, searchIndex);
    }
    return { pathname, search, hash };
  }

  private parseQuery(search: string): Record<string, string> {
    if (!search || !search.startsWith("?")) return {};
    const params = new URLSearchParams(search.slice(1));
    const result: Record<string, string> = {};
    params.forEach((value, key) => { result[key] = value; });
    return result;
  }

  private getMatchedChain(route: Route): Route[] {
    const chain: Route[] = [route];
    return chain;
  }

  private collectMeta(chain: Route[]): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    for (const route of chain) {
      if (route.meta) {
        Object.assign(meta, route.meta);
      }
    }
    return meta;
  }

  buildPath(path: string, params: Record<string, string>): string {
    let result = path;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(`:${key}`, encodeURIComponent(value));
    }
    return result;
  }

  buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const query = searchParams.toString();
    return query ? `?${query}` : "";
  }

  buildURL(path: string, params?: Record<string, string>, query?: Record<string, string | number | boolean | undefined>, hash?: string): string {
    let url = params ? this.buildPath(path, params) : path;
    if (query) {
      url += this.buildQuery(query);
    }
    if (hash) {
      url += hash.startsWith("#") ? hash : `#${hash}`;
    }
    return url;
  }

  isDynamic(path: string): boolean {
    return /:[a-zA-Z_]/.test(path) || path.includes("*");
  }

  getParamNames(path: string): string[] {
    const matches = path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
    return [...matches].map((m) => m[1]);
  }

  hasParams(path: string): boolean {
    return this.getParamNames(path).length > 0;
  }

  getParamCount(path: string): number {
    return this.getParamNames(path).length;
  }

  isWildcard(path: string): boolean {
    return path.includes("*");
  }

  isStatic(path: string): boolean {
    return !this.isDynamic(path) && !this.isWildcard(path);
  }

  normalizePath(path: string): string {
    return path.startsWith("/") ? path : "/" + path;
  }

  isAbsolute(path: string): boolean {
    return path.startsWith("/");
  }

  isRelative(path: string): boolean {
    return !this.isAbsolute(path);
  }

  getDepth(path: string): number {
    return path.split("/").filter(Boolean).length;
  }

  isChildOf(parent: string, child: string): boolean {
    const parentSegments = parent.split("/").filter(Boolean);
    const childSegments = child.split("/").filter(Boolean);
    if (childSegments.length <= parentSegments.length) return false;
    for (let i = 0; i < parentSegments.length; i++) {
      if (parentSegments[i] !== childSegments[i] && !parentSegments[i].startsWith(":")) return false;
    }
    return true;
  }

  isParentOf(child: string, parent: string): boolean {
    return this.isChildOf(parent, child);
  }

  isSibling(a: string, b: string): boolean {
    const aSegments = a.split("/").filter(Boolean);
    const bSegments = b.split("/").filter(Boolean);
    if (aSegments.length !== bSegments.length) return false;
    for (let i = 0; i < aSegments.length - 1; i++) {
      if (aSegments[i] !== bSegments[i] && !aSegments[i].startsWith(":")) return false;
    }
    return true;
  }

  getCommonPrefix(a: string, b: string): string {
    const aSegments = a.split("/").filter(Boolean);
    const bSegments = b.split("/").filter(Boolean);
    const common: string[] = [];
    for (let i = 0; i < Math.min(aSegments.length, bSegments.length); i++) {
      if (aSegments[i] === bSegments[i]) {
        common.push(aSegments[i]);
      } else {
        break;
      }
    }
    return "/" + common.join("/");
  }

  getSimilarity(a: string, b: string): number {
    const aSegments = a.split("/").filter(Boolean);
    const bSegments = b.split("/").filter(Boolean);
    const maxLen = Math.max(aSegments.length, bSegments.length);
    if (maxLen === 0) return 1;
    let matches = 0;
    for (let i = 0; i < Math.min(aSegments.length, bSegments.length); i++) {
      if (aSegments[i] === bSegments[i]) matches++;
    }
    return matches / maxLen;
  }

  toJSON(): string {
    return JSON.stringify({ routes: this.getRouteCount(), dynamicRoutes: this.dynamicRoutes.length }, null, 2);
  }
}

export function createRouteMatcher(): RouteMatcher {
  return new RouteMatcher();
}

export class NavigationGuardManager {
  private beforeEachGuards: NavigationGuard[] = [];
  private beforeResolveGuards: NavigationGuard[] = [];
  private afterEachGuards: Array<(to: RouteMatch, from: RouteMatch) => void> = [];
  private beforeLeaveGuards: Array<(to: RouteMatch, from: RouteMatch) => boolean | Promise<boolean>> = [];

  beforeEach(guard: NavigationGuard): () => void {
    this.beforeEachGuards.push(guard);
    return () => {
      const index = this.beforeEachGuards.indexOf(guard);
      if (index !== -1) this.beforeEachGuards.splice(index, 1);
    };
  }

  beforeResolve(guard: NavigationGuard): () => void {
    this.beforeResolveGuards.push(guard);
    return () => {
      const index = this.beforeResolveGuards.indexOf(guard);
      if (index !== -1) this.beforeResolveGuards.splice(index, 1);
    };
  }

  afterEach(handler: (to: RouteMatch, from: RouteMatch) => void): () => void {
    this.afterEachGuards.push(handler);
    return () => {
      const index = this.afterEachGuards.indexOf(handler);
      if (index !== -1) this.afterEachGuards.splice(index, 1);
    };
  }

  beforeLeave(guard: (to: RouteMatch, from: RouteMatch) => boolean | Promise<boolean>): () => void {
    this.beforeLeaveGuards.push(guard);
    return () => {
      const index = this.beforeLeaveGuards.indexOf(guard);
      if (index !== -1) this.beforeLeaveGuards.splice(index, 1);
    };
  }

  async runBeforeEach(to: RouteMatch, from: RouteMatch): Promise<boolean | string | Route> {
    for (const guard of this.beforeEachGuards) {
      const result = await guard(to, from);
      if (result === false || typeof result === "string" || (typeof result === "object" && result !== null)) {
        return result;
      }
    }
    return true;
  }

  async runBeforeResolve(to: RouteMatch, from: RouteMatch): Promise<boolean | string | Route> {
    for (const guard of this.beforeResolveGuards) {
      const result = await guard(to, from);
      if (result === false || typeof result === "string" || (typeof result === "object" && result !== null)) {
        return result;
      }
    }
    return true;
  }

  async runBeforeLeave(to: RouteMatch, from: RouteMatch): Promise<boolean> {
    for (const guard of this.beforeLeaveGuards) {
      const result = await guard(to, from);
      if (!result) return false;
    }
    return true;
  }

  runAfterEach(to: RouteMatch, from: RouteMatch): void {
    for (const handler of this.afterEachGuards) {
      handler(to, from);
    }
  }

  async runAll(to: RouteMatch, from: RouteMatch): Promise<boolean | string | Route> {
    const leaveResult = await this.runBeforeLeave(to, from);
    if (!leaveResult) return false;
    const eachResult = await this.runBeforeEach(to, from);
    if (eachResult !== true) return eachResult;
    const resolveResult = await this.runBeforeResolve(to, from);
    if (resolveResult !== true) return resolveResult;
    this.runAfterEach(to, from);
    return true;
  }

  clear(): void {
    this.beforeEachGuards = [];
    this.beforeResolveGuards = [];
    this.afterEachGuards = [];
    this.beforeLeaveGuards = [];
  }

  getGuardCount(): number {
    return this.beforeEachGuards.length + this.beforeResolveGuards.length + this.afterEachGuards.length + this.beforeLeaveGuards.length;
  }

  getBeforeEachCount(): number {
    return this.beforeEachGuards.length;
  }

  getBeforeResolveCount(): number {
    return this.beforeResolveGuards.length;
  }

  getAfterEachCount(): number {
    return this.afterEachGuards.length;
  }

  getBeforeLeaveCount(): number {
    return this.beforeLeaveGuards.length;
  }

  hasGuards(): boolean {
    return this.getGuardCount() > 0;
  }
}

export function createNavigationGuardManager(): NavigationGuardManager {
  return new NavigationGuardManager();
}

export class HistoryAPI {
  private mode: "hash" | "history" | "memory";
  private current: string = "/";
  private listeners: Set<(location: string) => void> = new Set();
  private stack: string[] = ["/"];
  private stackIndex: number = 0;

  constructor(mode: "hash" | "history" | "memory" = "history") {
    this.mode = mode;
    if (mode !== "memory" && typeof window !== "undefined") {
      window.addEventListener("popstate", this.onPopState);
      if (mode === "hash") {
        window.addEventListener("hashchange", this.onHashChange);
      }
    }
  }

  private onPopState = (): void => {
    this.current = window.location.pathname + window.location.search + window.location.hash;
    this.notifyListeners();
  };

  private onHashChange = (): void => {
    this.current = window.location.hash.slice(1) || "/";
    this.notifyListeners();
  };

  push(path: string): void {
    if (this.mode === "memory") {
      this.stack = this.stack.slice(0, this.stackIndex + 1);
      this.stack.push(path);
      this.stackIndex++;
    } else if (this.mode === "hash") {
      window.location.hash = path;
    } else {
      window.history.pushState({}, "", path);
    }
    this.current = path;
    this.notifyListeners();
  }

  replace(path: string): void {
    if (this.mode === "memory") {
      this.stack[this.stackIndex] = path;
    } else if (this.mode === "hash") {
      window.location.replace(`#${path}`);
    } else {
      window.history.replaceState({}, "", path);
    }
    this.current = path;
    this.notifyListeners();
  }

  go(n: number): void {
    if (this.mode === "memory") {
      const newIndex = Math.max(0, Math.min(this.stackIndex + n, this.stack.length - 1));
      if (newIndex !== this.stackIndex) {
        this.stackIndex = newIndex;
        this.current = this.stack[newIndex];
        this.notifyListeners();
      }
    } else {
      window.history.go(n);
    }
  }

  back(): void {
    this.go(-1);
  }

  forward(): void {
    this.go(1);
  }

  getCurrent(): string {
    if (this.mode === "memory") {
      return this.current;
    } else if (this.mode === "hash") {
      return window.location.hash.slice(1) || "/";
    } else {
      return window.location.pathname + window.location.search + window.location.hash;
    }
  }

  canGoBack(): boolean {
    if (this.mode === "memory") {
      return this.stackIndex > 0;
    }
    return window.history.length > 1;
  }

  canGoForward(): boolean {
    if (this.mode === "memory") {
      return this.stackIndex < this.stack.length - 1;
    }
    return true;
  }

  getStack(): string[] {
    return [...this.stack];
  }

  getStackIndex(): number {
    return this.stackIndex;
  }

  getStackLength(): number {
    return this.stack.length;
  }

  getMode(): string {
    return this.mode;
  }

  setMode(mode: "hash" | "history" | "memory"): void {
    this.mode = mode;
  }

  on(listener: (location: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  off(listener: (location: string) => void): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.current));
  }

  clearStack(): void {
    this.stack = [this.current];
    this.stackIndex = 0;
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", this.onPopState);
      window.removeEventListener("hashchange", this.onHashChange);
    }
    this.clearListeners();
  }

  getLength(): number {
    if (this.mode === "memory") {
      return this.stack.length;
    }
    return window.history.length;
  }

  getState(): unknown {
    if (this.mode === "memory") {
      return null;
    }
    return window.history.state;
  }

  toJSON(): string {
    return JSON.stringify({
      mode: this.mode,
      current: this.current,
      stackLength: this.stack.length,
      stackIndex: this.stackIndex,
      listenerCount: this.listeners.size,
    }, null, 2);
  }
}

export function createHistoryAPI(mode?: "hash" | "history" | "memory"): HistoryAPI {
  return new HistoryAPI(mode);
}
