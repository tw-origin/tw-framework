/**
 * Signals v2 (power upgrade) — hub-level regression tests.
 * Caps, validation, stats, closeAll, id-frames, Last-Event-ID resume.
 */
import { describe, expect, test } from "bun:test";
import {
  SignalHub,
  getSignalHub,
  sseFrameWithId,
} from "../packages/server/tw/routing/signal-stream.ts";

function flush(hub: any) {
  (hub as any).flush();
}

describe("signals v2: validation + hygiene", () => {
  test("bad signal name is rejected and the hub stays untouched", () => {
    const hub = new SignalHub() as any;
    const r1 = hub.setSignal("bad name!", 1);
    expect(r1.queued).toBe(false);
    expect(r1.error).toBeTruthy();
    const r2 = hub.setSignal("", 1);
    expect(r2.queued).toBe(false);
    const r3 = hub.setSignal("x".repeat(65), 1);
    expect(r3.queued).toBe(false);
    expect(hub.values.size).toBe(0);
  });

  test("oversized value is rejected (64KB cap)", () => {
    const hub = new SignalHub() as any;
    const r = hub.setSignal("big", "x".repeat(65 * 1024));
    expect(r.queued).toBe(false);
    expect(r.error).toContain("bytes");
    expect(hub.values.size).toBe(0);
  });

  test("valid name+value still queues", () => {
    const hub = new SignalHub() as any;
    const r = hub.setSignal("price", 42);
    expect(r.queued).toBe(true);
    expect(hub.values.get("price")).toBe(42);
  });
});

describe("signals v2: stats + caps + shutdown", () => {
  test("getStats exposes counters", () => {
    const hub = new SignalHub() as any;
    hub.setSignal("a", 1);
    hub.setSignal("b", 2);
    flush(hub);
    const st = hub.getStats();
    expect(st.seq).toBe(1);
    expect(st.totalUpdates).toBe(2);
    expect(st.batchesFlushed).toBe(1);
    expect(st.signals.a).toBe("public");
    expect(st.history).toBe(1);
  });

  test("canAcceptClient respects the configurable cap", () => {
    const hub = new SignalHub() as any;
    hub.configure({ maxClients: 2 });
    expect(hub.canAcceptClient()).toBe(true);
    hub.register(new Map());
    hub.register(new Map());
    expect(hub.canAcceptClient()).toBe(false);
  });

  test("configure raises the history cap", () => {
    const hub = new SignalHub() as any;
    hub.configure({ maxHistory: 3 });
    for (let i = 0; i < 6; i++) { hub.setSignal("x", i); flush(hub); }
    expect(hub.getStats().history).toBe(3);
  });

  test("closeAll clears clients and pending", () => {
    const hub = new SignalHub() as any;
    hub.register(new Map());
    hub.setSignal("x", 1); // pending, unflushed
    hub.closeAll();
    expect(hub.getStats().clients).toBe(0);
    expect(hub.getStats().pending).toBe(0);
  });
});

describe("signals v2: SSE id frames (Last-Event-ID)", () => {
  test("frames carry id: + data: lines with the seq", () => {
    const f = sseFrameWithId('{"v":1,"seq":42,"updates":[["price",1]]}');
    expect(f).toBe('id: 42\ndata: {"v":1,"seq":42,"updates":[["price",1]]}\n\n');
  });

  test("non-JSON payloads fall back to a plain data frame", () => {
    const f = sseFrameWithId("not json");
    expect(f).toBe("data: not json\n\n");
  });
});

describe("signals v2: batching still coalesces (no regression)", () => {
  test("same-signal writes in one window collapse to the last value", () => {
    const hub = new SignalHub() as any;
    const got: string[] = [];
    const client = hub.register(new Map());
    client.send = (p) => got.push(p);
    hub.setSignal("price", 1);
    hub.setSignal("price", 2);
    hub.setSignal("price", 3);
    flush(hub);
    expect(got.length).toBe(1);
    expect(got[0]).toContain('"price",3');
  });

  test("distinct signals in one window share one frame", () => {
    const hub = new SignalHub() as any;
    const got: string[] = [];
    const client = hub.register(new Map());
    client.send = (p) => got.push(p);
    hub.setSignal("a", 1);
    hub.setSignal("b", 2);
    flush(hub);
    expect(got.length).toBe(1);
    expect(got[0]).toContain('"a",1');
    expect(got[0]).toContain('"b",2');
  });
});

describe("signals v2: singleton hub", () => {
  test("getSignalHub returns the same hub", () => {
    expect(getSignalHub()).toBe(getSignalHub());
  });
});
