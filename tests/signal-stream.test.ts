/**
 * Signal Streaming (Phase 1, docs/signal-streaming.md):
 *   Batch 1 — compiler: signal declarations, data-tw-s bindings,
 *             manifest exposure, serverOnly never leaks
 *   Batch 2 — server hub: batching, snapshot, resume, private filtering,
 *             setSignal injection into .twm route modules
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeRouteHandler } from "../packages/server/tw/routing/twm-loader";
import { SignalHub, setSignal, getSignalHub } from "../packages/server/tw/routing/signal-stream";

const tmp = mkdtempSync(join(tmpdir(), "tw-sig-"));
const file = (name: string, code: string): string => {
  const p = join(tmp, name);
  writeFileSync(p, code);
  return p;
};
const compile = async () => (await import("../packages/compiler/tw/index.ts")).compileSync as any;

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// --- Batch 1: compiler ------------------------------------------------------

describe("batch 1: compiler signal declarations", () => {
  test("publicSignal/privateSignal compile to data-tw-s bindings", async () => {
    const compileSync = await compile();
    const out = compileSync(
      [
        'page { title "L" render signalStream }',
        "",
        "state {",
        '  price = publicSignal(150.25)',
        '  trend = privateSignal("neutral")',
        "}",
        "",
        "div {",
        '  h1 "Price: {price}"',
        '  h2 "Trend: {trend}"',
        "}",
      ].join("\n"),
      { filePath: join(tmp, "live.tw") },
    );
    expect(out.html).toContain('<span data-tw-i="price" data-tw-s="price">150.25</span>');
    expect(out.html).toContain('<span data-tw-i="trend" data-tw-s="trend">neutral</span>');
    expect(out.streamedSignals).toEqual({ price: "public", trend: "private" });
    expect(out.stateSeed).toEqual({ price: 150.25, trend: "neutral" });
  });

  test("serverOnlySignal never seeds, never binds, never leaks", async () => {
    const compileSync = await compile();
    const out = compileSync(
      [
        'page { title "S" render signalStream }',
        "",
        "state {",
        "  secret = serverOnlySignal(42)",
        '  price = publicSignal(1)',
        "}",
        "",
        'div { h1 "P: {price}" }',
      ].join("\n"),
      { filePath: join(tmp, "secret.tw") },
    );
    expect(JSON.stringify(out.stateSeed)).not.toContain("secret");
    expect(out.html).not.toContain('data-tw-s="secret"');
    expect(out.streamedSignals).not.toHaveProperty("secret");
  });

  test("plain state still works and gets no data-tw-s", async () => {
    const compileSync = await compile();
    const out = compileSync(
      ['page { title "P" }', "", "state {", "  count = 0", "}", "", 'div { h1 "C: {count}" }'].join("\n"),
      { filePath: join(tmp, "plain.tw") },
    );
    expect(out.streamedSignals).toEqual({});
    expect(out.html).not.toContain("data-tw-s=");
  });

  test("render signalStream is an accepted mode", async () => {
    const compileSync = await compile();
    const out = compileSync('page { title "M" render signalStream }\n\ndiv { "x" }\n', {
      filePath: join(tmp, "mode.tw"),
    });
    const invalid = (out.diagnostics ?? []).filter((d: any) => /Invalid render mode/.test(d.message ?? ""));
    expect(invalid).toEqual([]);
  });
});

// --- Batch 2: server hub -----------------------------------------------------

describe("batch 2: signal hub", () => {
  test("updates batch into one frame with a sequence number", async () => {
    const hub = new SignalHub();
    const received: string[] = [];
    const client = hub.register(new Map([["price", "public"]]));
    client.send = (p: string) => received.push(p);
    hub.setSignal("price", 151.2);
    hub.setSignal("price", 152.5);
    await new Promise((r) => setTimeout(r, 160));
    expect(received.length).toBe(1);
    const frame = JSON.parse(received[0]);
    expect(frame.seq).toBe(1);
    expect(frame.updates).toEqual([["price", 152.5]]); // last write wins in the batch
  });

  test("connect resumes from a sequence number", async () => {
    const hub = new SignalHub();
    hub.setSignal("price", 1);
    await new Promise((r) => setTimeout(r, 160));
    hub.setSignal("price", 2);
    await new Promise((r) => setTimeout(r, 160));
    const declared = new Map([["price", "public"]]);
    const from1 = hub.connectPayloads(1, declared);
    expect(from1.length).toBe(1);
    expect(JSON.parse(from1[0]).updates).toEqual([["price", 2]]);
    const from0 = hub.connectPayloads(0, declared);
    expect(from0.length).toBe(2);
  });

  test("beyond history coverage a snapshot is served instead", async () => {
    const hub = new SignalHub();
    hub.setSignal("price", 9);
    await new Promise((r) => setTimeout(r, 160));
    const declared = new Map([["price", "public"]]);
    const out = hub.connectPayloads(999, declared);
    expect(out.length).toBe(1);
    const frame = JSON.parse(out[0]);
    expect(frame.snapshot).toEqual({ price: 9 });
  });

  test("private updates are filtered by declared signals", async () => {
    const hub = new SignalHub();
    const gotPublic: string[] = [];
    const gotBoth: string[] = [];
    const onlyPublic = hub.register(new Map([["price", "public"]]));
    onlyPublic.send = (p) => gotPublic.push(p);
    const both = hub.register(new Map([["price", "public"], ["balance", "private"]]));
    both.send = (p) => gotBoth.push(p);
    hub.setSignal("balance", 500);
    await new Promise((r) => setTimeout(r, 160));
    expect(gotPublic.length).toBe(0); // never delivered to the other page
    expect(gotBoth.length).toBe(1);
    expect(JSON.parse(gotBoth[0]).updates).toEqual([["balance", 500]]);
  });

  test("setSignal is injectable into .twm route modules via import from tw", async () => {
    const p = file(
      "set.twm",
      [
        'import { setSignal } from "tw";',
        "",
        "fn post(request) {",
        "  setSignal(\"price\", 42);",
        "  return { status: 200, json: { ok: true } };",
        "}",
      ].join("\n"),
    );
    mkdirSync(join(tmp, "x"), { recursive: true });
    const res: any = await executeRouteHandler(p, "POST", {
      url: "http://x/api/set",
      method: "POST",
      headers: {},
      body: {},
    });
    expect(res.status).toBe(200);
    // The hub (singleton behind setSignal) must now carry the update
    const snap = getSignalHub().snapshot();
    expect(snap.snapshot.price).toBe(42);
  });
});

// --- Phase 2: list/object initial values + session-scoped private signals --

describe("phase 2: signal declarations", () => {
  test("array and object initial values seed correctly", async () => {
    const compileSync = await compile();
    const out = compileSync(
      [
        'page { title "L" render signalStream }',
        "",
        "state {",
        "  items = publicSignal([1, 2, 3])",
        "  conf = privateSignal({ a: 1 })",
        '  price = publicSignal(150.25)',
        "}",
        "",
        'div { for item in items { li "{item}" } }',
      ].join("\n"),
      { filePath: join(tmp, "lits.tw") },
    );
    expect(out.stateSeed).toEqual({ items: [1, 2, 3], conf: { a: 1 }, price: 150.25 });
    expect(out.html).toContain('data-tw-list="items"');
  });
});

describe("phase 2: session-scoped private signals", () => {
  test("session-scoped update reaches only that session's client", async () => {
    const hub = new SignalHub();
    const aliceGot: string[] = [];
    const bobGot: string[] = [];
    const anonGot: string[] = [];
    const alice = hub.register(new Map([["balance", "private"]]), "alice-sess");
    alice.send = (p) => aliceGot.push(p);
    const bob = hub.register(new Map([["balance", "private"]]), "bob-sess");
    bob.send = (p) => bobGot.push(p);
    const anon = hub.register(new Map([["balance", "private"]]));
    anon.send = (p) => anonGot.push(p);
    hub.setSignal("balance", 100, { session: "alice-sess" });
    await new Promise((r) => setTimeout(r, 160));
    expect(aliceGot.length).toBe(1);
    expect(bobGot.length).toBe(0);
    expect(anonGot.length).toBe(0);
    expect(JSON.parse(aliceGot[0]).updates).toEqual([["balance", 100]]);
  });

  test("unscoped private update still reaches every declaring client", async () => {
    const hub = new SignalHub();
    const got: string[] = [];
    const client = hub.register(new Map([["trend", "private"]]));
    client.send = (p) => got.push(p);
    hub.setSignal("trend", "up");
    await new Promise((r) => setTimeout(r, 160));
    expect(got.length).toBe(1);
  });

  test("session-scoped replay filters on reconnect", async () => {
    const hub = new SignalHub();
    hub.setSignal("balance", 5, { session: "alice-sess" });
    await new Promise((r) => setTimeout(r, 160));
    const declared = new Map([["balance", "private"]]);
    const asAlice = hub.connectPayloads(0, declared, "alice-sess");
    const asBob = hub.connectPayloads(0, declared, "bob-sess");
    expect(asAlice.length).toBe(1);
    expect(asBob.length).toBe(0);
  });

  test("setSignal derives the session from a request's cookies", async () => {
    const hub = getSignalHub();
    const got: string[] = [];
    const client = hub.register(new Map([["cart", "private"]]), "sess-xyz");
    client.send = (p) => got.push(p);
    await setSignal("cart", ["apple"], { request: { headers: { get: () => "tw_session=sess-xyz; other=1" } } });
    await new Promise((r) => setTimeout(r, 160));
    expect(got.length).toBe(1);
    expect(JSON.parse(got[0]).updates).toEqual([["cart", ["apple"]]]);
  });
});

describe("phase 2: derivedSignal", () => {
  test("derived evaluates at build time and carries its expression", async () => {
    const compileSync = await compile();
    const out = compileSync(
      [
        'page { title "D" render signalStream }',
        "",
        "state {",
        "  price = publicSignal(10)",
        "  qty = 5",
        '  total = derivedSignal("price * qty")',
        "}",
        "",
        'div { h1 "T: {total}" }',
      ].join("\n"),
      { filePath: join(tmp, "derived.tw") },
    );
    expect(out.stateSeed).toEqual({ price: 10, qty: 5, total: 50 });
    expect(out.derivedSpecs).toEqual({ total: "price * qty" });
    expect(out.html).toContain(">T: <span data-tw-i=" + String.fromCharCode(34) + "total" + String.fromCharCode(34) + " data-tw-s=" + String.fromCharCode(34) + "total" + String.fromCharCode(34) + ">50</span>");
  });

  test("derived stays out of the stream manifest (not streamed, only computed)", async () => {
    const compileSync = await compile();
    const out = compileSync(
      [
        'page { title "D" render signalStream }',
        "",
        "state {",
        "  price = publicSignal(1)",
        '  total = derivedSignal("price * 2")',
        "}",
        "",
        'div { h1 "{total}" }',
      ].join("\n"),
      { filePath: join(tmp, "derived2.tw") },
    );
    expect(out.streamedSignals).toEqual({ price: "public" });
    expect(out.derivedSpecs).toEqual({ total: "price * 2" });
  });
});
