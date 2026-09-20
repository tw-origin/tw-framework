/** Plugin system -- lifecycle hooks, middleware injection, plugin API. */

import { existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

// --- Hook Types --------------------------------------------------------------

export type HookName =
  | "beforeCompile"
  | "afterCompile"
  | "beforeParse"
  | "afterParse"
  | "beforeGenerate"
  | "afterGenerate"
  | "beforeOptimize"
  | "afterOptimize"
  | "beforeTransform"
  | "afterTransform"
  | "beforeServe"
  | "afterServe"
  | "onRequest"
  | "onResponse"
  | "onError"
  | "onFileChange"
  | "onBuildStart"
  | "onBuildEnd"
  | "onDevServerStart"
  | "onDevServerStop"
  | "registerRoutes"
  | "registerMiddleware"
  | "registerComponents"
  | "registerDirectives";

export type HookHandler = (ctx: any, ...args: any[]) => unknown | Promise<unknown>;

export interface HookEntry {
  name: HookName;
  handler: HookHandler;
  priority: number;
  pluginName: string;
}

// --- Plugin Interface -------------------------------------------------------

export interface TWPlugin {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  priority?: number;
  /** Options passed from tw.config.ts (`{ name, options: {...} }` entries). */
  options?: any;

  setup?(api: PluginAPI): void | Promise<void>;
  teardown?(): void | Promise<void>;

  hooks?: Partial<Record<HookName, HookHandler>>;
  commands?: Record<string, (args: string[]) => void>;
  routes?: { method: string; path: string; handler: (ctx: any) => any }[];
  middleware?: ((ctx: any, next: () => Promise<void>) => Promise<void>)[];
  components?: Record<string, unknown>;
  directives?: Record<string, unknown>;
}

// --- Plugin API --------------------------------------------------------------

export class PluginAPI {
  private plugin: TWPlugin;
  private manager: PluginManager;

  constructor(plugin: TWPlugin, manager: PluginManager) {
    this.plugin = plugin;
    this.manager = manager;
  }

  on(hook: HookName, handler: HookHandler, priority: number = 50): void {
    this.manager.registerHook(hook, handler, priority, this.plugin.name);
  }

  once(hook: HookName, handler: HookHandler): void {
    const wrapped: HookHandler = async (ctx, ...args) => {
      this.manager.unregisterHook(hook, wrapped);
      return handler(ctx, ...args);
    };
    this.manager.registerHook(hook, wrapped, 0, this.plugin.name);
  }

  off(hook: HookName, handler: HookHandler): void {
    this.manager.unregisterHook(hook, handler);
  }

  registerRoute(method: string, path: string, handler: (ctx: any) => any): void {
    if (!this.plugin.routes) this.plugin.routes = [];
    this.plugin.routes.push({ method, path, handler });
  }

  registerMiddleware(mw: (ctx: any, next: () => Promise<void>) => Promise<void>): void {
    if (!this.plugin.middleware) this.plugin.middleware = [];
    this.plugin.middleware.push(mw);
  }

  registerComponent(name: string, component: any): void {
    if (!this.plugin.components) this.plugin.components = {};
    this.plugin.components[name] = component;
  }

  registerDirective(name: string, handler: any): void {
    if (!this.plugin.directives) this.plugin.directives = {};
    this.plugin.directives[name] = handler;
  }

  registerCommand(name: string, handler: (args: string[]) => void): void {
    if (!this.plugin.commands) this.plugin.commands = {};
    this.plugin.commands[name] = handler;
  }

  getConfig(): any {
    return this.manager.getConfig();
  }

  getLogger(): any {
    return this.manager.getLogger();
  }

  emit(hook: HookName, ctx: any, ...args: any[]): Promise<unknown[]> {
    return this.manager.runHook(hook, ctx, ...args) as unknown as Promise<unknown[]>;
  }
}

// --- Plugin Manager ---------------------------------------------------------

export class PluginManager {
  private plugins: Map<string, TWPlugin> = new Map();
  private hooks: Map<HookName, HookEntry[]> = new Map();
  private loaded: boolean = false;
  private config: any;
  private logger: any;
  private failedPlugins: Set<string> = new Set();

  constructor(config?: any, logger?: any) {
    this.config = config ?? {};
    this.logger = logger ?? console;
  }

  register(plugin: TWPlugin): void {
    if (this.plugins.has(plugin.name)) {
      this.logger.warn?.(`Plugin already registered: ${plugin.name}`);
      return;
    }

    this.plugins.set(plugin.name, plugin);

    // Register hooks from plugin.hooks
    if (plugin.hooks) {
      for (const [name, handler] of Object.entries(plugin.hooks)) {
        this.registerHook(name as HookName, handler as HookHandler, plugin.priority ?? 50, plugin.name);
      }
    }

    // Run setup if present
    if (plugin.setup) {
      const api = new PluginAPI(plugin, this);
      plugin.setup(api);
    }

    this.logger.log?.(`  Plugin registered: ${plugin.name} v${plugin.version}`);
  }

  unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    // Run teardown
    if (plugin.teardown) {
      plugin.teardown();
    }

    // Remove hooks
    for (const [hookName, entries] of this.hooks) {
      this.hooks.set(hookName, entries.filter((e) => e.pluginName !== name));
    }

    this.plugins.delete(name);
    this.logger.log?.(`  Plugin unregistered: ${name}`);
  }

  registerHook(name: HookName, handler: HookHandler, priority: number = 50, pluginName: string = "unknown"): void {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name)!.push({ name, handler, priority, pluginName });
  }

  unregisterHook(name: HookName, handler: HookHandler): void {
    const entries = this.hooks.get(name);
    if (!entries) return;
    this.hooks.set(name, entries.filter((e) => e.handler !== handler));
  }

  async runHooks(name: HookName, ctx: any, ...args: any[]): Promise<unknown[]> {
    const entries = this.hooks.get(name);
    if (!entries || entries.length === 0) return [];

    // Sort by priority (lower = earlier)
    const sorted = [...entries].sort((a, b) => a.priority - b.priority);
    const results: any[] = [];

    for (const entry of sorted) {
      // Failure isolation: a plugin that threw once is disabled for the
      // rest of this server's lifetime -- one bad plugin never takes the
      // site down or slows every request with repeated errors.
      if (this.failedPlugins.has(entry.pluginName)) continue;
      try {
        const result = await entry.handler(ctx, ...args);
        results.push(result);
      } catch (err: any) {
        this.failedPlugins.add(entry.pluginName);
        this.logger.error?.(`  Plugin disabled after error [${entry.pluginName}.${name}]: ${err?.message ?? err}`);
      }
    }

    return results;
  }

  async runHook(name: HookName, ctx: any, ...args: any[]): Promise<unknown> {
    const results = await this.runHooks(name, ctx, ...args);
    return results[results.length - 1];
  }

  // Load plugins from a directory
  async loadFromDir(pluginsDir: string): Promise<void> {
    if (!existsSync(pluginsDir)) return;

    const entries = readdirSync(pluginsDir);
    for (const entry of entries) {
      const ext = extname(entry).toLowerCase();
      if (![".ts", ".js", ".mjs"].includes(ext)) continue;

      const filePath = join(pluginsDir, entry);
      try {
        const mod = await import(filePath);
        const plugin = mod.default ?? mod;
        if (plugin && plugin.name) {
          this.register(plugin);
        }
      } catch (err: any) {
        this.logger.error?.(`  Failed to load plugin ${entry}: ${err.message}`);
      }
    }
  }

  // Load from config
  async loadFromConfig(config: { plugins: (string | { name: string; options?: any })[] }): Promise<void> {
    if (!config.plugins || !Array.isArray(config.plugins)) return;

    for (const entry of config.plugins) {
      const name = typeof entry === "string" ? entry : entry.name;
      const options = typeof entry === "string" ? {} : entry.options ?? {};

      try {
        const mod = await import(name);
        const PluginClass = mod.default ?? mod;
        const plugin = typeof PluginClass === "function" ? new PluginClass(options) : PluginClass;
        if (plugin && plugin.name) {
          this.register(plugin);
        }
      } catch (err: any) {
        this.logger.error?.(`  Failed to load plugin ${name}: ${err.message}`);
      }
    }
  }

  getPlugin(name: string): TWPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): TWPlugin[] {
    return [...this.plugins.values()];
  }

  getAllRoutes(): { method: string; path: string; handler: (ctx: any) => any; pluginName: string }[] {
    const routes: any[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.routes) {
        for (const route of plugin.routes) {
          routes.push({ ...route, pluginName: plugin.name });
        }
      }
    }
    return routes;
  }

  getAllMiddleware(): ((ctx: any, next: () => Promise<void>) => Promise<void>)[] {
    const mws: any[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.middleware) {
        mws.push(...plugin.middleware);
      }
    }
    return mws;
  }

  getAllComponents(): Record<string, unknown> {
    const components: Record<string, unknown> = {};
    for (const plugin of this.plugins.values()) {
      if (plugin.components) {
        Object.assign(components, plugin.components);
      }
    }
    return components;
  }

  getAllDirectives(): Record<string, unknown> {
    const directives: Record<string, unknown> = {};
    for (const plugin of this.plugins.values()) {
      if (plugin.directives) {
        Object.assign(directives, plugin.directives);
      }
    }
    return directives;
  }

  getCommands(): Record<string, (args: string[]) => void> {
    const commands: Record<string, (args: string[]) => void> = {};
    for (const plugin of this.plugins.values()) {
      if (plugin.commands) {
        Object.assign(commands, plugin.commands);
      }
    }
    return commands;
  }

  getConfig(): any {
    return this.config;
  }

  getLogger(): any {
    return this.logger;
  }

  /** All registered (and not failed) plugins. */
  list(): TWPlugin[] {
    return [...this.plugins.values()].filter((p) => !this.failedPlugins.has(p.name));
  }

  /** Disable a plugin at runtime (its hooks stop firing). */
  disablePlugin(name: string): void {
    this.failedPlugins.add(name);
  }

  size(): number {
    return this.plugins.size;
  }

  getHookCount(): number {
    let total = 0;
    for (const entries of this.hooks.values()) {
      total += entries.length;
    }
    return total;
  }
}

export type { Plugin, PluginContext } from "./manager";
export { EventSystem, HookMiddleware, HookSystem, LifecycleHooks, MiddlewareSystem, createEventSystem, createHookMiddleware, createHookSystem, createLifecycleHooks, createMiddlewareSystem } from "./hooks";
export type { HookContext } from "./hooks";

// --- App-level plugin loading ------------------------------------------------

/**
 * Load the plugins for a TW app.
 *
 * Resolution rule (config is the authority):
 *   1. `config.plugins` array in tw.config.ts -- entries are names
 *      (`"hit-counter"` -> `plugins/hit-counter.ts`) or relative paths.
 *      A plugin file that exists but is not listed does NOT run.
 *   2. No `plugins` field + a `plugins/` directory exists -- every `.ts`
 *      file in it is loaded (zero-config mode).
 *
 * Every plugin is loaded in isolation: a file that fails to import or
 * export a valid plugin object is skipped with a warning, never thrown.
 */
export async function loadPlugins(rootDir: string, config?: any, logger?: any): Promise<PluginManager> {
  const manager = new PluginManager(config, logger);
  const pluginsDir = join(rootDir, "plugins");
  const cfgList: any[] | null = Array.isArray(config?.plugins) ? config.plugins : null;

  const specs: string[] = [];
  if (cfgList) {
    for (const entry of cfgList) {
      if (typeof entry === "string") specs.push(entry);
      else if (entry && typeof entry === "object" && typeof entry.name === "string") specs.push(entry.name);
    }
  } else if (existsSync(pluginsDir)) {
    for (const file of readdirSync(pluginsDir)) {
      if (/\.ts$/.test(file) && !file.endsWith(".d.ts")) specs.push(file.replace(/\.ts$/, ""));
    }
  }

  for (const spec of specs) {
    const file = spec.startsWith(".") || spec.startsWith("/") || spec.includes("/")
      ? join(rootDir, spec)
      : join(pluginsDir, spec + ".ts");
    if (!existsSync(file)) {
      (logger ?? console).warn?.(`  Plugin not found, skipped: ${spec}`);
      continue;
    }
    try {
      const mod: any = await import(pathToFileURL(file).href);
      const plugin: TWPlugin | undefined = mod.default ?? mod.plugin;
      if (!plugin || typeof plugin.name !== "string") {
        (logger ?? console).warn?.(`  Plugin skipped (no name export): ${spec}`);
        continue;
      }
      const cfgEntry = cfgList?.find((e: any) => e && typeof e === "object" && e.name === plugin.name);
      if (cfgEntry?.options) plugin.options = cfgEntry.options;
      manager.register(plugin);
    } catch (err: any) {
      (logger ?? console).warn?.(`  Plugin failed to load (${spec}): ${err?.message ?? err}`);
    }
  }

  return manager;
}
