/**
 * index.ts -- TW Framework runtime barrel.
 *
 * Re-exports the public surface of every runtime module. The alias approach is
 * retained (it resolves export-name conflicts cleanly), and all exports from
 * the upgraded files are surfaced here with no duplicates.
 */

// ---------------------------------------------------------------------------
// render.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// component.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// store.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// router.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ssr-streaming.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// hydration.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Convenience default export: the whole runtime as a namespace object.
// ---------------------------------------------------------------------------

import * as render from './render';
import * as component from './component';
import * as store from './store';
import * as router from './router';
import * as ssrStreaming from './ssr-streaming';
import * as hydration from './hydration';
import { reactive } from './dependency-graph';

// Version metadata.
export const VERSION = '0.0.1-hardened19-upgraded';
export type RuntimeVersion = typeof VERSION;

export { addAnimationTask, animateProperty, easings, getAnimationLoop, removeAnimationTask, tween } from "./animation-frame";
export type { AnimationGroup, AnimationTask, EasingFunction, TweenHandle, TweenOptions } from "./animation-frame";
export { defineAsyncComponent, getAsyncLoader, getSuspenseManager, preloadAsyncComponent, withSuspense } from "./async-components";
export type { AsyncComponentOptions, AsyncComponentState, SuspenseBoundary } from "./async-components";
export { cacheClear, cacheDelete, cacheGet, cacheHas, cacheSet, cacheStats, getCacheManager } from "./cache-manager";
export type { CacheEntry, CacheLayer, CacheOptions, CacheStats } from "./cache-manager";
export { copyHTML, copyJSON, copyToClipboard, getClipboardManager, pasteFromClipboard } from "./clipboard-utils";
export type { ClipboardOptions } from "./clipboard-utils";
export { ErrorBoundary, Fragment, Suspense, createContext, defineComponent, forwardRef, fragment, memo, resolveContext, withScope } from "./component";
export type { Component, ComponentFactory, ComponentOptions, ComponentProps, Context, ContextValueStack, DefaultProps, DefaultState, ErrorBoundaryProps, ForwardRefComponent, MemoComponent, SetupContext, SuspenseProps, VNode, VNodeChild } from "./component";
export { clearAllContexts, consumeContext, mapContext, popContextScope, provideContext, pushContextScope, setContextValue, useContext, useContextSignal, validateContext, withContextScope } from "./context";
export type { ContextEntry } from "./context";
export { assertCondition, debugLog, errorLog, getDebugger, infoLog, inspectObject, isDev, isProd, measureTime, measureTimeAsync, warnLog } from "./debug-utils";
export type { DebugOptions, LogEntry, LogLevel, PerformanceMeasurement } from "./debug-utils";
export { ReactiveScope, batch, computed, createScope, effect, endBatch, getSubscriberCount, isComputed, isSignal, onCleanup, reactive, ref, signal, startBatch, toRef, toRefs, untrack, watch, watchEffect } from "./dependency-graph";
export type { ComputedSignal, Effect, Signal } from "./dependency-graph";
export { disableDevTools, enableDevTools, getDevTools, isDevToolsEnabled } from "./devtools";
export type { ComponentTreeNode, DevtoolsState } from "./devtools";
export { DiffEngine, createDiffEngine } from "./diff-engine";
export type { PatchResult } from "./diff-engine";
export { acquireVNode, clearPool, configurePool, diffKeyed, diffKeyedFull, diffUnkeyed, generateKeyedPatches, poolSize, releaseVNode } from "./diff-optimized";
export type { KeyedDiffOp, KeyedDiffOptions, VNodePoolConfig } from "./diff-optimized";
export { diff, diffChildren, diffProps, diffTextNode, diffVNode, escapeHtml, removeAllEventListeners, removeProp, setProp } from "./diff";
export type { ChildPatch } from "./diff";
export { clickOutsideDirective, clipboardDirective, debounceDirective, focusDirective, getDirectiveRegistry, intersectionDirective, lazyDirective, longpressDirective, mutationDirective, registerBuiltinDirectives, registerDirective, resizeDirective, unregisterDirective } from "./directives";
export type { Directive, DirectiveBinding, DirectiveHooks } from "./directives";
export { addClass, append, closest, createElement, createText, find, findAll, getAttr, getOffset, getScrollParent, getStyle, hasAttr, hasClass, insertBefore, isElement, isInViewport, on, once, prepend, readDOM, remove, removeAttr, removeClass, removeStyle, replaceChild, scrollTo, setAttr, setAttrs, setClasses, setStyle, setStyles, styleToString, toggleClass, writeDOM } from "./dom-utils";
export { makeDraggable, makeSortable } from "./drag-drop";
export type { DragEvent, DragMoveEvent, DragOptions, DropEvent } from "./drag-drop";
export { createErrorBoundary, getErrorRecovery, withErrorRecovery } from "./error-recovery";
export type { ErrorContext, ErrorRecoveryOptions, RecoveryHandle } from "./error-recovery";
export { createEventBus, emit, emitSync, getEventBus, off, offAll } from "./event-bus";
export type { EventHandler, EventMeta, EventOptions, Subscription } from "./event-bus";
export { EventDelegator, buildSelector, delegate, delegateGlobal, destroyEventDelegation, getDelegator, initEventDelegation, onChange, onClick, onInput, onKeydown, onSubmit, parseEventModifiers } from "./event-delegation";
export type { DelegatedHandler, HandlerOptions } from "./event-delegation";
export { getHttpClient, httpDelete, httpGet, httpPost, httpPut, setBaseURL, uploadFile } from "./fetch-utils";
export type { FetchOptions, FetchResponse, Interceptor } from "./fetch-utils";
export { FocusTrap, autoFocus, createFocusTrap, getFocusStack } from "./focus-trap";
export type { FocusTrapOptions } from "./focus-trap";
export { createForm, createFormFromSchema, validators } from "./form-validation";
export type { FieldConfig, FieldState, FormConfig, FormData, FormState, ValidatorFn } from "./form-validation";
export { createGestureRecognizer, onDoubleTap, onLongPress, onPinch, onSwipe } from "./gesture-recognition";
export type { GestureEvent, GestureOptions, Point, SwipeDirection } from "./gesture-recognition";
export { __setMountVNode, hydrate, hydrateElementById, markForHydration, unmarkForHydration } from "./hydration";
export type { HydrationError, HydrationMode, HydrationOptions, HydrationStats } from "./hydration";
export { formatCurrency, formatDate, formatList, formatNumber, formatRelativeTime, getI18n, getLocale, getTextDirection, initI18n, isRTL, setLocale, t, tn, useLocale, useTranslation } from "./i18n-runtime";
export type { I18nOptions, Locale, MessageParams, PluralCategory } from "./i18n-runtime";
export { clearRegisteredIds, createIdGenerator, decodeHashId, encodeHashId, isIdUsed, nanoId, registerId, releaseId, resetSequentialCounter, sequentialId, setSnowflakeWorkerId, snowflake, ulid, uniqueId, uuid } from "./id-generator";
export { createOptimizedImage, createResponsivePicture, getImageOptimizer, preloadImage } from "./image-optimizer";
export type { ImageSource, ProcessedImage, ResponsiveImageOptions } from "./image-optimizer";
export { getScrollDirection, getScrollDirectionDetector, getVisibilityManager, observeVisibility, whenInViewport, whenVisible } from "./intersection-observer";
export type { ScrollDirection, VisibilityOptions, VisibilityState } from "./intersection-observer";
export { KeepAlive, createKeepAlive } from "./keep-alive";
export type { KeepAliveOptions, KeepAliveStats } from "./keep-alive";
export { getKeyboardManager, getShortcutHelp, registerShortcut, setShortcutScope } from "./keyboard-shortcuts";
export type { ShortcutEntry, ShortcutHelpItem, ShortcutOptions } from "./keyboard-shortcuts";
export { consoleTransport, createLogger, fileTransport, getLogger, jsonTransport, logDebug, logError, logFatal, logInfo, logTrace, logWarn, networkTransport, setGlobalLogger } from "./logger";
export type { LogContext, LogRecord, LogTransport, LoggerOptions } from "./logger";
export { defaultBreakpoints, useBreakpoint, useCanHover, useConnectionType, useDevicePixelRatio, useDocumentVisible, useIsOnline, useIsTouchDevice, useMediaQuery, useOrientation, usePrefersColorScheme, usePrefersDark, usePrefersReducedMotion, useViewportHeight, useViewportSize, useViewportWidth } from "./media-query";
export type { Breakpoints, ColorScheme, Orientation } from "./media-query";
export { ObjectPool, acquireElement, destroyMemoryManager, getDOMPool, getMemoryManager, releaseElement, releaseVNodes, vnodePool } from "./memory-pool";
export { alertDialog, closeAllModals, closeModal, confirmDialog, getModalManager, openModal, showModal } from "./modal-dialog";
export type { ConfirmOptions, ModalOptions } from "./modal-dialog";
export { createCursorPagination, createPagination } from "./pagination";
export type { CursorPaginationState, PageRange, PaginationOptions, PaginationState } from "./pagination";
export { createAnalyticsPlugin, createErrorReportingPlugin, devtoolsPlugin, getPluginManager, usePlugin } from "./plugin-system";
export type { PluginContext, PluginRegistration, TWPlugin } from "./plugin-system";
export { Teleport, createPortal, createTeleportNode, destroyAllPortals, destroyPortal, getPortal, teleport } from "./portal";
export type { PortalOptions } from "./portal";
export { enableProfiler, endProfiling, getProfiler, getProfilerStats, startProfiling } from "./profiler";
export type { ProfileEntry, ProfileSession, ProfilerStats } from "./profiler";
export { createInjectionKey, disposeProviderTree, enterScope, exitScope, getCurrentProvider, getRootProvider, initProviderTree, inject, injectReactive, provide, provideFactory, provideReactive } from "./provide-inject";
export type { InjectionKey, ProviderEntry } from "./provide-inject";
export { CLIENT_RUNTIME, blueprintToHydrationData, generateBlueprint, isReactive } from "./reactivity";
export type { BlueprintNode, Ref, Watcher } from "./reactivity";
export { VOID_ELEMENTS, escapeText, h, renderError, renderToStream, renderToStreamAsync, renderToString, vnodeToString } from "./render";
export type { RenderOptions, StyleObject, StyleProp } from "./render";
export { createRouter, navigate, redirectTo, routerLink, routerView, setRouter, useRoute, useRouter } from "./router";
export type { NavigationGuard, NavigationResult, RouteLocation, RouteParams, RouteQuery, RouteRecord, Router, RouterLinkProps, RouterOptions, RouterViewProps } from "./router";
export { cancel, flush, flushSync, getStats, isScheduled, nextTick, peekQueue, queueJob, resetScheduler, schedule } from "./scheduler";
export type { Priority, SchedulePriority, ScheduledJob, SchedulerStats } from "./scheduler";
export { clearServiceWorkerCaches, generateServiceWorkerScript, getServiceWorkerManager, registerServiceWorker, unregisterServiceWorker } from "./service-worker";
export type { CacheRule, CacheStrategy, ServiceWorkerOptions } from "./service-worker";
export { createFallback, createSlotContent, createSlotNode, defineScopedSlot, defineSlot, getSlotNames, getSlotRegistry, hasSlot, renderSlot, resolveSlots, useSlots } from "./slots";
export type { SlotContext, SlotDefinition, SlotRenderFn } from "./slots";
export { renderStreamToString, renderToReadableStream } from "./ssr-streaming";
export type { StreamOptions, StreamRenderResult } from "./ssr-streaming";
export { ReactiveValue, __setRenderingComponent, createGlobalState, defineStore, useStore, useStoreAction } from "./store";
export type { ComputedValue, Listener, StoreContext, StoreContextType, StoreDefinition, StoreInstance, StoreProviderContext, StoreSnapshot, StoreState, Unsubscribe } from "./store";
export { getThemeManager, initTheme, isDarkMode, setThemeMode, toggleTheme, useTheme, useThemeMode } from "./theme-manager";
export type { Theme, ThemeColors, ThemeManagerOptions, ThemeMode } from "./theme-manager";
export { dismissAllToasts, dismissToast, getToastManager, toast, toastError, toastInfo, toastSuccess, toastWarning } from "./toast-notifications";
export type { ToastEntry, ToastOptions, ToastPosition, ToastType } from "./toast-notifications";
export { TransitionManager, createBuiltinTransitions, createTransitionManager, getTransitionManager, initTransitionManager } from "./transitions";
export type { FlipRecord, TransitionDefinition, TransitionMode, TransitionState } from "./transitions";
export type { BeforeMountHook, BeforeUnmountHook, BeforeUpdateHook, Blueprint, ComponentContext, ComponentDefinition, ComponentInstance, ComponentRenderFn, ComponentState, CreatedHook, DOMOps, DirectiveElement, DirectiveHook, ExtractProps, ExtractState, HydrationData, LifecycleHooks, MountedHook, Partial2, Patch, PatchType, PropChange, PropDefinition, SSRContext, Scheduler, SchedulerFlushMode, SchedulerJob, UnmountedHook, UpdatedHook, VNodeChildren, VNodeKey, VNodeProps, VNodeType } from "./types";
export { VNODE_SYMBOL, cloneVNode, createCommentVNode, createFragment, createTextVNode, createVNode, getKey, isSameVNode, isVNode, markVNode, normalizeChild, normalizeChildren } from "./vdom";
export { VirtualList, createVirtualList } from "./virtual-list";
export type { VirtualListOptions } from "./virtual-list";
export { watchAll, watchDeep, watchOnce } from "./watch-deep";
export type { WatchCallback, WatchOptions, WatchSource, WatcherHandle } from "./watch-deep";
export { closeAllConnections, closeConnection, createConnection, getConnection } from "./websocket-manager";
export type { ConnectionStatus, WSMessage, WSOptions } from "./websocket-manager";
export { createInlineWorker, createWorkerPool, getWorkerPool, terminateAllPools } from "./worker-pool";
export type { WorkerPoolOptions, WorkerTask } from "./worker-pool";
export { DragDropManager, FormValidator, GestureRecognizer, I18nManager, ThemeManager, createDragDropManager, createFormValidator, createI18n, createThemeManager } from "./i18n";
export type { GestureData, LocaleConfig, TranslationEntry, TranslationMessages, ValidationRule } from "./i18n";

// Stubs for test compatibility
export class VDOM {
  private root: any = null;
  mount(el: any, container: any): any { this.root = el; return el; }
  unmount(): void { this.root = null; }
  patch(newVNode: any): void { this.root = newVNode; }
  toHTML(): string { return ""; }
}

/** Create a reactive proxy over `value` -- delegates to `reactive()` so
 *  property access/assignment is tracked like the rest of the reactivity
 *  system, instead of the previous non-reactive `{ value }` wrapper. */
export function createReactive<T extends object>(value: T): T {
  return reactive(value as Record<string, unknown>) as T;
}
