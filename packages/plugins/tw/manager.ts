/**
 * Plugin lifecycle manager -- manages plugin registration, hook execution,
 * and plugin-to-plugin communication. Supports async hooks, parallel
 * execution for independent hooks, and error isolation.
 *
 * 22 lifecycle hooks are supported, covering the entire build and serve
 * pipeline from config resolution to response sending.
 */

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
  app: any;
  config: any;
  state: Map<string, any>;
  cache: Map<string, any>;
  logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

export interface Plugin {
  name: string;
  version: string;
  hooks: Partial<Record<HookName, Function>>;
  config?: Record<string, any>;
  priority?: number;
}

export class PluginManager {
  private plugins: Plugin[] = [];
  private hookMap: Map<HookName, Plugin[]> = new Map();
  private context: PluginContext;
  private errors: Array<{ plugin: string; hook: HookName; error: Error }> = [];

  constructor(context?: Partial<PluginContext>) {
    this.context = {
      app: null,
      config: {},
      state: new Map(),
      cache: new Map(),
      logger: undefined,
      ...context,
    };
  }

  register(plugin: Plugin): void {
    if (!plugin.name) {
      throw new Error("Plugin must have a name");
    }
    // Check for duplicate
    if (this.plugins.some(p => p.name === plugin.name)) {
      this.log("warn", `Plugin '${plugin.name}' is already registered -- replacing`);
      this.plugins = this.plugins.filter(p => p.name !== plugin.name);
    }

    this.plugins.push(plugin);

    // Sort by priority (higher priority runs first)
    this.plugins.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Rebuild hook map
    this.rebuildHookMap();
  }

  unregister(name: string): void {
    this.plugins = this.plugins.filter(p => p.name !== name);
    this.rebuildHookMap();
  }

  private rebuildHookMap(): void {
    this.hookMap.clear();
    for (const plugin of this.plugins) {
      for (const hookName of Object.keys(plugin.hooks) as HookName[]) {
        if (!this.hookMap.has(hookName)) {
          this.hookMap.set(hookName, []);
        }
        this.hookMap.get(hookName)!.push(plugin);
      }
    }
  }

  /**
   * Run a hook sequentially -- each plugin's hook runs in order,
   * and the result of each is passed to the next.
   */
  async runHook<T>(hookName: HookName, initialValue: T, ...args: any[]): Promise<T> {
    const plugins = this.hookMap.get(hookName);
    if (!plugins || plugins.length === 0) return initialValue;

    let value = initialValue;
    for (const plugin of plugins) {
      const hook = plugin.hooks[hookName];
      if (!hook) continue;
      try {
        const result = await hook.call(plugin, value, this.context, ...args);
        if (result !== undefined) {
          value = result as T;
        }
      } catch (error) {
        this.errors.push({ plugin: plugin.name, hook: hookName, error: error as Error });
        this.log("error", `Plugin '${plugin.name}' hook '${hookName}' error: ${(error as Error).message}`);
        // Continue to next plugin -- don't let one plugin break the pipeline
      }
    }
    return value;
  }

  /**
   * Run a hook in parallel -- all plugins' hooks run concurrently.
   * Returns when all are done. Errors are collected but don't stop others.
   */
  async runHookParallel(hookName: HookName, ...args: any[]): Promise<void> {
    const plugins = this.hookMap.get(hookName);
    if (!plugins || plugins.length === 0) return;

    const promises = plugins.map(async (plugin) => {
      const hook = plugin.hooks[hookName];
      if (!hook) return;
      try {
        await hook.call(plugin, this.context, ...args);
      } catch (error) {
        this.errors.push({ plugin: plugin.name, hook: hookName, error: error as Error });
        this.log("error", `Plugin '${plugin.name}' hook '${hookName}' error: ${(error as Error).message}`);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Run a transform hook -- chains transforms, each receiving the output
   * of the previous one.
   */
  async runTransform(hookName: HookName, content: string, moduleId: string): Promise<string> {
    return this.runHook(hookName, content, moduleId);
  }

  getPlugins(): Plugin[] {
    return [...this.plugins];
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.find(p => p.name === name);
  }

  getErrors(): Array<{ plugin: string; hook: HookName; error: Error }> {
    return [...this.errors];
  }

  clearErrors(): void {
    this.errors = [];
  }

  hasHook(hookName: HookName): boolean {
    return this.hookMap.has(hookName) && (this.hookMap.get(hookName)?.length ?? 0) > 0;
  }

  getHookPlugins(hookName: HookName): Plugin[] {
    return this.hookMap.get(hookName) ?? [];
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    if (this.context.logger) {
      this.context.logger[level](message);
    }
  }
}

// --- Built-in Plugins -----------------------------------------------
