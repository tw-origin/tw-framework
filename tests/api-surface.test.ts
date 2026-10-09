import { describe, test, expect } from "bun:test";
// Import the WHOLE 2.1 surface by name, exactly as documented. A missing or
// renamed export fails this file at import time -- which is the point.
import * as request from "@tw/sdk/request";
import * as response from "@tw/sdk/response";
import * as cacheMod from "@tw/sdk/cache";
import * as wrappers from "@tw/sdk/wrappers";
import * as runtime from "@tw/runtime";
import * as head from "@tw/Head";
import * as script from "@tw/Script";
import * as form from "@tw/Form";
import * as og from "@tw/og";

const SURFACE: Array<[string, Record<string, unknown>, string[]]> = [
  ["@tw/sdk/request", request as any, [
    "clientIp", "ipAddress", "normalizeIp", "isPrivateIp", "inCidr", "trustProxy",
    "geolocation", "waitUntil", "after", "defer", "background", "parseDuration",
    "env", "getEnv", "deadline", "getDeadline", "metric", "counter", "gauge",
    "histogram", "timer", "userAgent", "connection", "dynamic", "staticRoute",
    "pendingTasks", "setWaitUntilHook", "setMetricSink", "collectedMetrics", "clearMetrics",
  ]],
  ["@tw/sdk/response", response as any, [
    "redirect", "permanentRedirect", "forbidden", "unauthorized", "notFound", "badRequest", "jsonResponse",
  ]],
  ["@tw/sdk/cache", cacheMod as any, [
    "cache", "getCache", "cached", "draftMode", "resetCache", "setDraftSecret", "verifyDraftCookie",
  ]],
  ["@tw/sdk/wrappers", wrappers as any, [
    "TWRequest", "TWResponse", "CookieJar", "twRequest",
  ]],
  ["@tw/runtime", runtime as any, [
    "usePathname", "useSearchParams", "useParams", "useParam", "useParamInt",
    "useParamBool", "useParamList", "useRouteSegments", "matchPathPattern",
  ]],
  ["@tw/Head", head as any, ["og", "twitter", "jsonLd", "headTagsFor", "renderHead"]],
  ["@tw/Script", script as any, ["renderScript", "scriptAttributesFor", "isScriptStrategy", "SCRIPT_STRATEGIES"]],
  ["@tw/Form", form as any, ["renderForm", "formAttributesFor", "renderField"]],
  ["@tw/og", og as any, ["imageResponse", "toSvg", "toPng", "pngResponse", "setPngRenderer", "canRenderPng", "ogTemplate", "wrapText"]],
];

describe("API surface: every documented export resolves", () => {
  for (const [mod, ns, names] of SURFACE) {
    test(`${mod} exports all ${names.length} documented names`, () => {
      const missing = names.filter((n) => ns[n] === undefined);
      expect(missing).toEqual([]);
    });
  }

  test("callables are actually callable", () => {
    for (const [mod, ns, names] of SURFACE) {
      for (const n of names) {
        const v = ns[n];
        expect(typeof v === "function" || typeof v === "object").toBe(true);
      }
    }
  });

  test("the strategy list is complete", () => {
    expect((script as any).SCRIPT_STRATEGIES).toHaveLength(5);
  });
});
