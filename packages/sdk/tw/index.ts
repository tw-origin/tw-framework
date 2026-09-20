/**
 * TW SDK -- Public API Entry Point.
 *
 * This is the main module users import from:
 *
 *   import { createApp, defineComponent, definePage, html, css } from "@tw/sdk";
 *
 * The SDK re-exports everything from:
 * - ./types     -- all public TypeScript interfaces and types
 * - ./app       -- createApp, AppBuilder, lifecycle management
 * - ./component -- defineComponent, h, Fragment, createRef, memo
 * - ./helpers   -- definePage, defineLayout, defineMiddleware, definePlugin,
 *                  defineRoute, html, css, json, middleware factories,
 *                  defineAsyncComponent, defineErrorBoundary, defineSuspense,
 *                  createRouter
 *
 * Runtime, server, compiler, security, and shared packages are re-exported
 * as namespaced modules to avoid export conflicts (e.g. `createContext`
 * exists in both runtime and app).
 *
 * @version 0.0.1
 */

// --- Types (all public types) -----------------------------------------

// --- App (createApp, AppBuilder, lifecycle) ---------------------------

// --- Component System -------------------------------------------------

// --- Helpers (definePage, defineLayout, etc.) --------------------------

// --- Namespaced Runtime Exports ---------------------------------------
//
// Re-export the runtime package as `Runtime.*` to avoid export name
// conflicts (the SDK has its own createContext, defineStore, etc.).
//
// Usage:
//   import { Runtime } from "@tw/sdk";
//   Runtime.signal(0);
//   Runtime.defineStore({ ... });
//   Runtime.createRouter({ routes: [...] });

import * as RuntimeNS from "@tw/runtime";
import { VERSION } from "./app";

export const Runtime = RuntimeNS;

// --- Namespaced Server Exports ----------------------------------------

import * as ServerNS from "@tw/server";

export const Server = ServerNS;

// --- Namespaced Security Exports --------------------------------------

import * as SecurityNS from "@tw/security";

export const Security = SecurityNS;

// --- Namespaced Shared Exports -----------------------------------------

import * as SharedNS from "@tw/shared";

export const Shared = SharedNS;

// --- Namespaced Compiler Exports ---------------------------------------

import * as CompilerNS from "@tw/compiler";

export const Compiler = CompilerNS;

// --- Global ------------------------------------------------------------


export const TW_GLOBAL = {
  version: VERSION,
  mode: typeof process !== "undefined" ? (process.env.NODE_ENV ?? "development") : "development",
  isDev: typeof process !== "undefined" ? process.env.NODE_ENV !== "production" : true,
  isProd: typeof process !== "undefined" ? process.env.NODE_ENV === "production" : false,
} as const;

export type TWGlobal = typeof TW_GLOBAL;

// --- Convenience: most-used runtime exports (explicit, no conflicts) ---
//
// These are the most commonly used runtime functions that don't conflict
// with SDK names. Importing them directly here saves users an extra import.

export {
  // Reactivity
  signal,
  effect,
  watchEffect,
  batch,
  untrack,
  onCleanup,
  // State management
  defineStore,
  useStore,
  // Router (runtime version with full features)
  createRouter as createRuntimeRouter,
  useRouter,
  useRoute,
  navigate as navigateTo,
  // i18n
  t,
  setLocale,
  getLocale,
  formatDate,
  formatNumber,
  formatCurrency,
  // Dev
  enableDevTools,
  enableProfiler,
  getProfiler,
} from "@tw/runtime";

// Re-export types that users commonly need from runtime
export type {
  Signal,
  ComputedSignal,
  Effect,
  StoreState,
  StoreDefinition,
  StoreSnapshot,
  RouteRecord,
  RouteLocation,
  RouterOptions,
  NavigationResult,
  I18nOptions as RuntimeI18nOptions,
  Locale,
} from "@tw/runtime";

export { AppBuilder, VERSION, createApp, isDevelopment, isProduction, loadConfig } from "./app";
export { Fragment, createComponent, createRef, defineComponent, h } from "./component";
export { corsMiddleware, corsMiddlewareFactory, createRouter, css, defineAsyncComponent, defineErrorBoundary, defineLayout, defineMiddleware, definePage, definePlugin, defineRoute, defineSuspense, escapeHtml, html, join, json, loggingMiddleware, loggingMiddlewareFactory, memo, normalizePath, parseCookies, rateLimitMiddlewareFactory, serializeCookie, unescapeHtml } from "./helpers";
export type { SDKRouter } from "./helpers";
export type { AppConfig, AppMode, AppOptions, BuildContext, BuildStats, BuildTarget, BundleContext, CSPMode, CacheConfig, CacheType, CompileContext, ComponentDefinition, ComponentInstance, ComponentOptions, ComponentSetupContext, ComponentSetupResult, ComputedGetter, CookieOptions, DirectiveBinding, DirectiveHandler, ErrorHandler, ErrorInfo, HookName, I18nConfig, I18nStrategy, LayoutDefinition, LifecycleHook, MethodFn, Middleware, NextFunction, NotFoundHandler, PageDefinition, PluginAPI, PluginContext, PluginDefinition, PluginHooks, PluginLogger, PropDefinition, PropType, PropsDefinition, RenderContext, RequestContext, RouteDefinition, RouteHandler, SecurityConfig, ServeContext, ServerLifecycleContext, SourcemapOption, TWApp, VNode, WatchCallback } from "./types";
