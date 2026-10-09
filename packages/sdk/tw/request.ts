/**
 * Re-export of the request-context helpers (docs/request-context.md).
 *
 * The implementation lives in `@tw/shared` so that `@tw/server` -- and through
 * it the user-facing `"tw"` specifier -- can reach the same functions.
 * Prefer `import { clientIp } from "tw"` in a project.
 */
export {
  after, background, clearDynamicReasons, clearMetrics, clientIp, collectedMetrics,
  connection, counter, deadline, defer, dynamic, dynamicReasons, env, gauge, geolocation,
  getDeadline, getEnv, histogram, inCidr, ipAddress, isPrivateIp, metric, normalizeIp,
  parseDuration, pendingTasks, setMetricSink, setWaitUntilHook, staticRoute, timer,
  trustProxy, userAgent, waitUntil,
} from "@tw/shared";
export type {
  ClientIp, Deadline, DeferredTask, Duration, EnvSchemaResult, EnvType, EnvValues,
  Geo, MetricPoint, UserAgentInfo,
} from "@tw/shared";
