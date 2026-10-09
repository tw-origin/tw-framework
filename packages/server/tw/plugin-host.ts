/**
 * Dev plugin host.
 *
 * The server calls `runHook("onRequest" | "onResponse" | "onError", ...)` on
 * whatever object you pass as `plugins`. This is the object that makes that
 * contract real: register plugins, run their lifecycle once, and dispatch
 * hooks in registration order with a dev-only escape hatch.
 *
 * A plugin is:
 *
 *   {
 *     name: "analytics",
 *     dev: true,                       // only active with { dev: true }
 *     setup(ctx)   { ... },            // runs once at init
 *     hooks: {
 *       onRequest(req)   { ... },
 *       onResponse(req, res) { ... },  // may return a new Response
 *       onError(req, err) { ... },
 *       onBuild(info)    { ... },      // dev/build-time only
 *     },
 *     teardown() { ... },
 *   }
 */

export type HookName = "onRequest" | "onResponse" | "onError" | "onBuild";

export interface PluginContext {
  dev: boolean;
  /** Log a namespaced message through the host. */
  log(message: string): void;
  /** The host, so a plugin can register another plugin. */
  host: PluginHost;
}

export interface Plugin {
  name: string;
  /** Dev-only plugin: skipped unless the host was built with { dev: true }. */
  dev?: boolean;
  setup?(ctx: PluginContext): void | Promise<void>;
  hooks?: Partial<Record<HookName, (data: any) => any>>;
  teardown?(): void | Promise<void>;
}

export interface PluginHost {
  size(): number;
  /** Names of the active plugins, in order. */
  names(): string[];
  register(plugin: Plugin): PluginHost;
  /** Run every plugin's `setup`. */
  init(): Promise<void>;
  /** Dispatch a hook to every active plugin, in order. */
  runHook(name: HookName, data?: any): Promise<any>;
  /** Run every plugin's `teardown` and clear the registry. */
  dispose(): Promise<void>;
  has(name: string): boolean;
}

/** Build a plugin host. `{ dev: true }` enables plugins marked `dev`. */
export function createPluginHost(opts: { dev?: boolean; log?: (m: string) => void } = {}): PluginHost {
  const dev = opts.dev ?? false;
  const log = opts.log ?? ((m: string) => console.log(m));
  const plugins: Plugin[] = [];
  let initialised = false;

  const ctx: PluginContext = {
    dev,
    log: (message) => log(`[plugin] ${message}`),
    get host() { return host; },
  };

  const host: PluginHost = {
    size: () => plugins.length,
    names: () => plugins.map((p) => p.name),
    has: (name) => plugins.some((p) => p.name === name),
    register(plugin) {
      if (!plugin?.name) throw new Error("a plugin needs a name");
      if (plugin.dev && !dev) return host; // dev-only, and this is not dev
      if (plugins.some((p) => p.name === plugin.name)) {
        throw new Error(`plugin "${plugin.name}" is already registered`);
      }
      plugins.push(plugin);
      return host;
    },
    async init() {
      for (const p of plugins) {
        if (!p.setup) continue;
        try { await p.setup(ctx); }
        catch (e: any) { log(`[plugin] ${p.name} setup failed: ${e?.message ?? e}`); }
      }
      initialised = true;
    },
    async runHook(name, data) {
      let out = undefined;
      for (const p of plugins) {
        const hook = p.hooks?.[name];
        if (!hook) continue;
        try {
          const result = await hook(data);
          // onResponse may replace the response; later hooks see the new value.
          if (result !== undefined) { out = result; if (name === "onResponse") data = result; }
        } catch (e: any) {
          // One plugin must never take the request down.
          log(`[plugin] ${p.name} ${name} threw: ${e?.message ?? e}`);
        }
      }
      return out;
    },
    async dispose() {
      for (const p of plugins) {
        if (!p.teardown) continue;
        try { await p.teardown(); }
        catch (e: any) { log(`[plugin] ${p.name} teardown failed: ${e?.message ?? e}`); }
      }
      plugins.length = 0;
      initialised = false;
    },
  };

  void initialised;
  return host;
}
