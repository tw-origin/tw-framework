/**
 * TW SDK -- Type definitions.
 *
 * Fully typed public API surface. No `unknown` or `any` leaks.
 * All generics are preserved so consumers get full type inference.
 */

// --- App Types -------------------------------------------------------

export type AppMode = "development" | "production" | "test";
export type BuildTarget = "browser" | "node" | "bun" | "edge";
export type SourcemapOption = boolean | "external" | "inline";
export type CacheType = "memory" | "disk" | "redis";
export type CSPMode = "strict" | "nonce" | "off";
export type I18nStrategy = "path" | "domain" | "cookie";

// --- Config ----------------------------------------------------------

export interface I18nConfig {
  locales: string[];
  defaultLocale: string;
  strategy: I18nStrategy;
  fallback: string;
}

export interface SecurityConfig {
  csp: CSPMode;
  rateLimit: { windowMs: number; maxRequests: number };
  csrf: boolean;
  https: boolean;
}

export interface CacheConfig {
  type: CacheType;
  ttl: number;
  maxItems: number;
}

export interface AppConfig {
  rootDir: string;
  outDir: string;
  publicDir: string;
  pagesDir: string;
  layoutsDir: string;
  componentsDir: string;
  port: number;
  host: string;
  mode: AppMode;
  minify: boolean;
  sourcemap: SourcemapOption;
  splitting: boolean;
  treeshake: boolean;
  target: BuildTarget;
  define: Record<string, string>;
  external: string[];
  i18n?: I18nConfig;
  security?: SecurityConfig;
  cache?: CacheConfig;
}

// --- App Options (user-facing) ---------------------------------------

export interface AppOptions {
  rootDir?: string;
  port?: number;
  host?: string;
  pagesDir?: string;
  staticDir?: string;
  componentsDir?: string;
  layoutsDir?: string;
  outDir?: string;
  mode?: AppMode;
  minify?: boolean;
  sourcemap?: SourcemapOption;
  splitting?: boolean;
  treeshake?: boolean;
  target?: BuildTarget;
  define?: Record<string, string>;
  external?: string[];
  plugins?: string[];
  cors?: boolean;
  security?: boolean;
  rateLimit?: { windowMs: number; max: number };
  compression?: boolean;
  securityHeaders?: boolean;
  i18n?: I18nConfig;
  securityConfig?: SecurityConfig;
  cache?: CacheConfig;
}

// --- Plugin System ---------------------------------------------------

export type HookName =
  | "config:resolve"
  | "pages:discover"
  | "before:compile"
  | "after:compile"
  | "before:bundle"
  | "after:bundle"
  | "before:render"
  | "after:render"
  | "before:serve"
  | "after:serve"
  | "error"
  | "hmr:update"
  | "transform:js"
  | "transform:css"
  | "transform:html"
  | "optimize:asset"
  | "route:match"
  | "response:before-send"
  | "server:start"
  | "server:stop"
  | "before:build"
  | "after:build";

export interface PluginContext {
  app: TWApp;
  config: AppConfig;
  state: Map<string, unknown>;
  cache: Map<string, unknown>;
  logger?: PluginLogger;
}

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface PluginHooks {
  "config:resolve"?: (config: AppConfig) => AppConfig | Promise<AppConfig>;
  "pages:discover"?: (app: TWApp) => void | Promise<void>;
  "before:compile"?: (ctx: CompileContext) => void | Promise<void>;
  "after:compile"?: (ctx: CompileContext) => void | Promise<void>;
  "before:bundle"?: (ctx: BundleContext) => void | Promise<void>;
  "after:bundle"?: (ctx: BundleContext) => void | Promise<void>;
  "before:render"?: (ctx: RenderContext) => void | Promise<void>;
  "after:render"?: (ctx: RenderContext, html: string) => string | Promise<string>;
  "before:serve"?: (ctx: ServeContext) => void | Promise<void>;
  "after:serve"?: (ctx: ServeContext) => void | Promise<void>;
  "error"?: (error: Error, ctx: RequestContext) => void | Promise<void>;
  "hmr:update"?: (moduleId: string) => void | Promise<void>;
  "transform:js"?: (code: string, moduleId: string) => string | Promise<string>;
  "transform:css"?: (code: string, moduleId: string) => string | Promise<string>;
  "transform:html"?: (html: string, ctx: RequestContext) => string | Promise<string>;
  "optimize:asset"?: (content: Buffer, path: string) => Buffer | Promise<Buffer>;
  "route:match"?: (path: string, ctx: RequestContext) => void | Promise<void>;
  "response:before-send"?: (ctx: RequestContext) => void | Promise<void>;
  "server:start"?: (ctx: ServerLifecycleContext) => void | Promise<void>;
  "server:stop"?: (ctx: ServerLifecycleContext) => void | Promise<void>;
  "before:build"?: (ctx: BuildContext) => void | Promise<void>;
  "after:build"?: (ctx: BuildContext) => void | Promise<void>;
}

export interface PluginDefinition {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  priority?: number;
  setup?: (api: PluginAPI) => void | Promise<void>;
  teardown?: () => void | Promise<void>;
  hooks?: Partial<PluginHooks>;
  config?: Record<string, unknown>;
}

export interface PluginAPI {
  on(hook: HookName, handler: (...args: unknown[]) => unknown, priority?: number): void;
  once(hook: HookName, handler: (...args: unknown[]) => unknown): void;
  off(hook: HookName, handler: (...args: unknown[]) => unknown): void;
  registerRoute(method: string, path: string, handler: RouteHandler): void;
  registerMiddleware(mw: Middleware): void;
  registerComponent(name: string, component: ComponentDefinition): void;
  registerDirective(name: string, handler: DirectiveHandler): void;
  getConfig(): AppConfig;
  getLogger(): PluginLogger;
  emit(hook: HookName, ctx: unknown, ...args: unknown[]): Promise<unknown[]>;
}

export interface DirectiveHandler {
  mounted?: (el: HTMLElement, binding: DirectiveBinding) => void;
  updated?: (el: HTMLElement, binding: DirectiveBinding) => void;
  unmounted?: (el: HTMLElement, binding: DirectiveBinding) => void;
}

export interface DirectiveBinding {
  value: unknown;
  oldValue?: unknown;
  arg?: string;
  modifiers: Record<string, boolean>;
}

// --- Compile / Bundle / Render Context -------------------------------

export interface CompileContext {
  entry: string;
  output: string;
  files: string[];
  cache: Map<string, unknown>;
}

export interface BundleContext {
  entrypoints: string[];
  output: string;
  chunks: string[];
  cache: Map<string, unknown>;
}

export interface RenderContext {
  url: URL;
  path: string;
  template: string;
  data: Record<string, unknown>;
  cache: Map<string, unknown>;
}

export interface ServeContext {
  port: number;
  host: string;
  url: URL;
}

export interface ServerLifecycleContext {
  port: number;
  host: string;
  pid: number;
}

export interface BuildContext {
  config: AppConfig;
  output: string;
  files: string[];
  stats: BuildStats;
}

export interface BuildStats {
  duration: number;
  modules: number;
  chunks: number;
  assets: number;
  errors: number;
  warnings: number;
}

// --- Middleware -------------------------------------------------------

export type NextFunction = () => Promise<void>;

export type Middleware = (
  ctx: RequestContext,
  next: NextFunction,
) => Promise<void> | void;

export type RouteHandler = (ctx: RequestContext) => Promise<Response | unknown> | Response | unknown;

export type ErrorHandler = (error: Error, ctx: RequestContext) => Promise<Response> | Response;

export type NotFoundHandler = (ctx: RequestContext) => Promise<Response> | Response;

// --- Request Context (Web API based) ----------------------------------

export interface RequestContext {
  request: Request;
  url: URL;
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: unknown;
  state: Record<string, unknown>;
  locals: Record<string, unknown>;
  page?: PageDefinition;
  layout?: LayoutDefinition;
  response: Response | null;
  redirect(to: string, status?: number): Response;
  json(data: unknown, status?: number): Response;
  html(content: string, status?: number): Response;
  text(content: string, status?: number): Response;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | null;
  cookie(name: string, value: string, opts?: CookieOptions): void;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  maxAge?: number;
  path?: string;
  domain?: string;
}

// --- Pages & Layouts -------------------------------------------------

export interface PageDefinition {
  path: string;
  component: ComponentDefinition;
  layout?: string;
  middleware?: string[];
  loading?: ComponentDefinition;
  error?: ErrorHandler;
  meta?: Record<string, string>;
  revalidate?: number;
  static?: boolean;
  serverOnly?: boolean;
}

export interface LayoutDefinition {
  name: string;
  component: ComponentDefinition;
  slots: string[];
  middleware?: string[];
}

// --- Component System ------------------------------------------------

export type PropType = String | Number | Boolean | Object | Array<any> | Function | Symbol;

export interface PropDefinition<T = unknown> {
  type: PropType | PropType[];
  default?: T | (() => T);
  required?: boolean;
  validator?: (value: unknown) => boolean;
}

export type PropsDefinition<P = Record<string, unknown>> = {
  [K in keyof P]: PropType | PropType[] | PropDefinition<P[K]>;
};

export type LifecycleHook = () => void | (() => void);
export type WatchCallback<T = unknown> = (newVal: T, oldVal: T | undefined) => void;
export type ComputedGetter<T = unknown> = () => T;
export type MethodFn<P extends Record<string, unknown> = Record<string, unknown>, S extends Record<string, unknown> = Record<string, unknown>> = (
  this: ComponentInstance<P, S>,
  ...args: unknown[]
) => unknown;

export interface ComponentOptions<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  props?: PropsDefinition<P>;
  state?: () => S;
  setup?: (props: P, ctx: ComponentSetupContext) => ComponentSetupResult | void;
  render?: (this: ComponentInstance<P, S>) => string | import("./vdom-types").VNode | null;
  styles?: string;
  methods?: { [K: string]: MethodFn<P, S> };
  computed?: { [K: string]: ComputedGetter };
  watch?: { [K: string]: WatchCallback };
  lifecycle?: {
    onMount?: LifecycleHook;
    onUnmount?: LifecycleHook;
    onUpdate?: LifecycleHook;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    shouldUpdate?: (
      oldProps: P,
      newProps: P,
      oldState: S,
      newState: S,
    ) => boolean;
  };
  components?: Record<string, ComponentDefinition>;
  emits?: string[];
}

export interface ComponentSetupContext {
  emit: (event: string, ...args: unknown[]) => void;
  provide: <T>(key: string, value: T) => void;
  inject: <T>(key: string, defaultValue?: T) => T | undefined;
  refs: Record<string, { current: unknown }>;
}

export interface ComponentSetupResult {
  state?: Record<string, unknown>;
  methods?: Record<string, (...args: unknown[]) => unknown>;
  computed?: Record<string, ComputedGetter>;
  watch?: Record<string, WatchCallback>;
  onMount?: LifecycleHook;
  onUnmount?: LifecycleHook;
  onUpdate?: LifecycleHook;
}

export interface ComponentInstance<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  props: P;
  state: S;
  methods: Record<string, (...args: unknown[]) => unknown>;
  computed: Record<string, unknown>;
  isMounted: boolean;
  dom: HTMLElement | null;
  render(): string | import("./vdom-types").VNode | null;
  setState(updates: Partial<S>, callback?: () => void): void;
  forceUpdate(): void;
  mount(el: HTMLElement): void;
  unmount(): void;
  onMount?: LifecycleHook;
  onUnmount?: LifecycleHook;
  onUpdate?: LifecycleHook;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  shouldUpdate?: (
    oldProps: P,
    newProps: P,
    oldState: S,
    newState: S,
  ) => boolean;
}

export interface ComponentDefinition<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  __isTWComponent: true;
  name: string;
  options: ComponentOptions<P, S>;
  create(props?: Partial<P>): ComponentInstance<P, S>;
}

export interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
}

// --- Route Definition ------------------------------------------------

export interface RouteDefinition {
  method: string;
  path: string;
  handler: RouteHandler;
  middleware?: string[];
}

// --- TWApp (the running application instance) -------------------------

export interface TWApp {
  mode?: any;
  rootDir?: any;
  name: string;
  version: string;
  config: AppConfig;
  pages: Map<string, PageDefinition>;
  layouts: Map<string, LayoutDefinition>;
  middlewares: Middleware[];
  routes: RouteDefinition[];
  plugins: PluginDefinition[];
  errorPage?: ErrorHandler;
  notFoundPage?: NotFoundHandler;
  ready: boolean;
  running: boolean;
  server: unknown;
  startTime: number;
}

// --- VNode re-export for component render functions ------------------

export interface VNode {
  type: "element" | "text" | "fragment" | "component" | "comment";
  tag?: string;
  props?: Record<string, unknown>;
  children?: VNode[];
  text?: string;
  key?: string | number;
}
