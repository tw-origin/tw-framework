/**
 * TW Framework -- docs deep-check round (v32): the 50 reference docs'
 * claims verified against code; regressions for the fixes this round:
 *   - route handlers may return { html } or { text } bodies (were silently {})
 *   - lib/ imports are server-only in pages regardless of extension
 *     (bare "lib/x" slipped past TW1007 as a presumed npm specifier)
 *   - scheduler cancel() takes the job id returned by schedule()
 *   - virtual list exposes scrollToItem/setItemCount (docs previously
 *     documented invented names)
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeRouteHandler } from "../packages/server/tw/routing/twm-loader";
import { findServerOnlyViolations } from "../apps/cli/tw/commands/client-bundle";
import { schedule, cancel } from "../packages/runtime/tw/scheduler";
import { createVirtualList } from "../packages/runtime/tw/virtual-list";

const tmp = mkdtempSync(join(tmpdir(), "tw-docs-"));
const file = (name: string, code: string): string => {
  const p = join(tmp, name);
  writeFileSync(p, code);
  return p;
};
const plainRequest = (url: string, method = "GET") => ({
  url,
  method,
  headers: { get: () => null },
  json: async () => ({}),
});

describe("docs round: response bodies", () => {
  test("html responses carry their html through the loader", async () => {
    const p = file("html-route.twm", `export function get(request) {
  return { status: 200, html: "<h1>Hi</h1>" };
}
`);
    const out = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    expect(out.status).toBe(200);
    expect(out.html).toBe("<h1>Hi</h1>");
  });

  test("text responses carry their text through the loader", async () => {
    const p = file("text-route.twm", `export function get(request) {
  return { status: 200, text: "plain" };
}
`);
    const out = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    expect(out.text).toBe("plain");
  });

  test("json still the default; legacy body alias still works", async () => {
    const p = file("body-route.twm", `export function get(request) {
  return { status: 200, body: { legacy: true } };
}
`);
    const out = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    expect(out.json).toEqual({ legacy: true });
    expect(out.html).toBeUndefined();
    expect(out.text).toBeUndefined();
  });
});

describe("docs round: TW1007 server-only boundary", () => {
  test('bare "lib/x" import in a page is flagged', () => {
    expect(findServerOnlyViolations('import { greet } from "lib/greet"\ndiv { "x" }'))
      .toEqual(["lib/greet"]);
  });

  test('"lib/x.ts" import in a page is flagged too', () => {
    expect(findServerOnlyViolations('import { greet } from "lib/greet.ts"\ndiv { "x" }'))
      .toEqual(["lib/greet.ts"]);
  });

  test("npm and @tw/runtime imports stay allowed", () => {
    expect(findServerOnlyViolations('import { toast } from "@tw/runtime"\nimport leftPad from "left-pad"\ndiv { "x" }'))
      .toEqual([]);
  });
});

describe("docs round: runtime API shapes", () => {
  test("schedule returns a job id that cancel() accepts", () => {
    const id = schedule(() => {});
    expect(typeof cancel(id)).toBe("boolean");
  });

  test("virtual list exposes scrollToItem and setItemCount", () => {
    const el = {
      style: {},
      appendChild() {},
      addEventListener() {},
      scrollTo() {},
      clientHeight: 600,
      scrollTop: 0,
    } as unknown as HTMLElement;
    const list = createVirtualList(el, {
      itemCount: 100,
      itemHeight: 40,
      renderItem: (i: number, item: HTMLElement) => { item.textContent = String(i); },
    });
    expect(typeof list.scrollToItem).toBe("function");
    expect(typeof list.setItemCount).toBe("function");
    expect(typeof list.getFirstVisibleIndex).toBe("function");
    list.setItemCount(50);
    list.scrollToItem(10);
    list.scrollToItem(500, "center");
  });
});
