/**
 * Plugin System -- runtime plugins for extending the framework.
 *
 * Plugins can:
 * - Add global components
 * - Register directives
 * - Register stores
 * - Add router guards
 * - Hook into lifecycle events
 * - Provide/inject values
 * - Add middleware
 *
 * Usage:
 *   const myPlugin = {
 *     name: "my-plugin",
 *     install(app, options) {
 *       app.component("MyWidget", WidgetComponent)
 *       app.directive("tw-tooltip", tooltipDirective)
 *     },
 *   }
 *   app.use(myPlugin, { option1: true })
 */

// --- Types ------------------------------------------------------------

export interface PluginContext {
  component: (name: string, component: unknown) => void;
  directive: (name: string, directive: unknown) => void;
  store: (name: string, store: unknown) => void;
  guard: (fn: () => boolean) => void;
  provide: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
  app: unknown;
}

export interface TWPlugin {
  name: string;
  version?: string;
  install: (context: PluginContext, options?: Record<string, unknown>) => void | Promise<void>;
  uninstall?: () => void;
}

export interface PluginRegistration {
  plugin: TWPlugin;
  options: Record<string, unknown>;
  installed: boolean;
}

// --- Plugin Manager --------------------------------------------------

class PluginManager {
  private plugins = new Map<string, PluginRegistration>();
  private components = new Map<string, unknown>();
  private directives = new Map<string, unknown>();
  private stores = new Map<string, unknown>();
  private guards: Array<() => boolean> = [];
  private providers = new Map<string, unknown>();
  private config: Record<string, unknown> = {};
  private app: unknown;

  setApp(app: unknown): void {
    this.app = app;
  }

  setConfig(config: Record<string, unknown>): void {
    this.config = config;
  }

  /**
   * Install a plugin.
   */
  use(plugin: TWPlugin, options: Record<string, unknown> = {}): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[TW Plugins] Plugin '${plugin.name}' is already installed.`);
      return;
    }

    const registration: PluginRegistration = {
      plugin,
      options,
      installed: false,
    };

    this.plugins.set(plugin.name, registration);

    const context: PluginContext = {
      component: (name: string, component: unknown) => {
        this.components.set(name, component);
      },
      directive: (name: string, directive: unknown) => {
        this.directives.set(name, directive);
      },
      store: (name: string, store: unknown) => {
        this.stores.set(name, store);
      },
      guard: (fn: () => boolean) => {
        this.guards.push(fn);
      },
      provide: (key: string, value: unknown) => {
        this.providers.set(key, value);
      },
      config: this.config,
      app: this.app,
    };

    try {
      const result = plugin.install(context, options);
      if (result instanceof Promise) {
        result.catch(e => console.error(`[TW Plugins] Async install error for '${plugin.name}':`, e));
      }
      registration.installed = true;
    } catch (e) {
      console.error(`[TW Plugins] Failed to install '${plugin.name}':`, e);
      this.plugins.delete(plugin.name);
    }
  }

  /**
   * Uninstall a plugin.
   */
  uninstall(name: string): void {
    const registration = this.plugins.get(name);
    if (!registration) return;

    if (registration.plugin.uninstall) {
      try { registration.plugin.uninstall(); }
      catch (e) { console.error(`[TW Plugins] Uninstall error for '${name}':`, e); }
    }

    this.plugins.delete(name);
  }

  /**
   * Get a registered component.
   */
  getComponent(name: string): unknown | undefined {
    return this.components.get(name);
  }

  /**
   * Get a registered directive.
   */
  getDirective(name: string): unknown | undefined {
    return this.directives.get(name);
  }

  /**
   * Get a registered store.
   */
  getStore(name: string): unknown | undefined {
    return this.stores.get(name);
  }

  /**
   * Get all guards.
   */
  getGuards(): Array<() => boolean> {
    return [...this.guards];
  }

  /**
   * Get a provided value.
   */
  getProvided(key: string): unknown | undefined {
    return this.providers.get(key);
  }

  /**
   * Get all installed plugins.
   */
  getInstalledPlugins(): string[] {
    return Array.from(this.plugins.entries())
      .filter(([, reg]) => reg.installed)
      .map(([name]) => name);
  }

  /**
   * Check if a plugin is installed.
   */
  isInstalled(name: string): boolean {
    const reg = this.plugins.get(name);
    return reg ? reg.installed : false;
  }

  /**
   * Uninstall all plugins.
   */
  uninstallAll(): void {
    for (const name of Array.from(this.plugins.keys())) {
      this.uninstall(name);
    }
    this.components.clear();
    this.directives.clear();
    this.stores.clear();
    this.guards = [];
    this.providers.clear();
  }
}

// --- Global Plugin Manager ------------------------------------------

let globalPluginManager: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!globalPluginManager) globalPluginManager = new PluginManager();
  return globalPluginManager;
}

export function usePlugin(plugin: TWPlugin, options?: Record<string, unknown>): void {
  getPluginManager().use(plugin, options);
}

// --- Built-in Plugins ------------------------------------------------

/**
 * DevTools plugin -- enables inspection API.
 */
export const devtoolsPlugin: TWPlugin = {
  name: "tw-devtools",
  version: "0.0.1",
  install(context) {
    // Would enable devtools bridge
    context.config.devtools = true;
  },
};

/**
 * Error reporting plugin -- sends errors to external service.
 */
export function createErrorReportingPlugin(reportUrl: string): TWPlugin {
  return {
    name: "tw-error-reporting",
    version: "0.0.1",
    install(context) {
      context.config.errorReportUrl = reportUrl;
      context.provide("errorReportUrl", reportUrl);
    },
  };
}

/**
 * Analytics plugin -- tracks page views and events.
 */
export function createAnalyticsPlugin(trackFn: (event: string, data: unknown) => void): TWPlugin {
  return {
    name: "tw-analytics",
    version: "0.0.1",
    install(context) {
      context.provide("track", trackFn);
      context.guard(() => {
        trackFn("page-view", { url: typeof window !== "undefined" ? window.location.pathname : "/" });
        return true;
      });
    },
  };
}
