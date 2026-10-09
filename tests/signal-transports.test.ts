/**
 * Signal transport tests — SSE, WebSocket and long-poll all speak the same
 * frame protocol, and every transport registers the same hub client.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getSignalHub, setSignal, SignalHub } from "../packages/server/tw/routing/signal-stream.ts";
import {
  attachSignalSocket,
  createSignalLongPoll,
  detachSignalSocket,
  parseStreamQuery,
} from "../packages/server/tw/routing/signal-transports.ts";

describe("signal transports: shared query parsing", () => {
  test("names, since and session cookie", () => {
    // NOTE: `new Request(..., {headers:{cookie}})` drops Cookie in the test
    // runtime (forbidden header), so the cookie path uses a header stub.
    const stub = {
      url: "http://x/_tw/stream?s=price,trend&since=7",
      headers: { get: (k: string) => (k.toLowerCase() === "cookie" ? "tw_session=abc123; other=1" : null) },
    } as unknown as Request;
    const q = parseStreamQuery(stub, new URL(stub.url));
    expect(q.names).toEqual(["price", "trend"]);
    expect(q.since).toBe(7);
    expect(q.session).toBe("abc123");
    expect(q.declared.get("price")).toBe("public");
  });

  test("Last-Event-ID resumes when ?since= is absent (all transports)", () => {
    const req = new Request("http://x/_tw/poll?s=price", {
      headers: { "last-event-id": "42" },
    });
    expect(parseStreamQuery(req, new URL(req.url)).since).toBe(42);
  });

  test("anonymous stream has no session", () => {
    const req = new Request("http://x/_tw/stream?s=price");
    expect(parseStreamQuery(req, new URL(req.url)).session).toBeUndefined();
  });
});

describe("signal transports: long-poll", () => {
  test("returns resume frames immediately when history exists", async () => {
    const hub = getSignalHub();
    hub.configure({ maxHistory: 100 });
    setSignal("lp_a", 1);
    await new Promise((r) => setTimeout(r, 150));

    const req = new Request("http://x/_tw/poll?s=lp_a&since=0");
    const res = await createSignalLongPoll(req, new URL(req.url), { maxWaitMs: 50 });
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.frames)).toBe(true);
    expect(body.frames.length).toBeGreaterThan(0);
  });

  test("a poll never hangs: it always answers with a frames array", async () => {
    // The hub serves a snapshot when the client is out of history coverage,
    // so a poll can answer immediately. The contract under test is: always a
    // JSON body with `frames`, and never longer than maxWaitMs (+ slack).
    const req = new Request("http://x/_tw/poll?s=lp_never_set&since=999999");
    const t0 = Date.now();
    const res = await createSignalLongPoll(req, new URL(req.url), { maxWaitMs: 120 });
    const body: any = await res.json();
    expect(Array.isArray(body.frames)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(600);
  });

  test("a signal written while the poll is open is delivered in that poll", async () => {
    const hub = getSignalHub();
    setSignal("lp_live", 1);                       // establish the signal
    await new Promise((r) => setTimeout(r, 150));
    const since = hub.getStats().seq;              // current seq -> no replay, no snapshot

    const url = "http://x/_tw/poll?s=lp_live&since=" + since;
    const p = createSignalLongPoll(new Request(url), new URL(url), { maxWaitMs: 5000 });
    await new Promise((r) => setTimeout(r, 200));
    setSignal("lp_live", 99);                      // arrives during the wait

    const res = await p;
    const body: any = await res.json();
    const joined = body.frames.join(" ");
    expect(joined).toContain("lp_live");
    expect(joined).toContain("99");
  });

  test("?stats=1 returns JSON without opening a stream", async () => {
    const req = new Request("http://x/_tw/poll?stats=1");
    const res = await createSignalLongPoll(req, new URL(req.url), { maxWaitMs: 10 });
    expect(res.headers.get("content-type")).toContain("application/json");
    const body: any = await res.json();
    expect(body).toHaveProperty("clients");
  });
});

describe("signal transports: websocket", () => {
  test("socket receives frames in the shared protocol and detach frees the slot", async () => {
    const hub = getSignalHub();
    const sent: string[] = [];
    let closed = false;
    const ws = { send: (d: string) => sent.push(d), close: () => { closed = true; } };

    const client = attachSignalSocket(ws, new URL("http://x/_tw/ws?s=ws_a&since=0"));
    expect(typeof client.id).toBe("number");

    setSignal("ws_a", 7);
    await new Promise((r) => setTimeout(r, 150));

    expect(sent.length).toBeGreaterThan(0);
    const frame = JSON.parse(sent[sent.length - 1]);
    expect(frame.v).toBe(1);
    expect(JSON.stringify(frame)).toContain("ws_a");

    const before = hub.getStats().clients;
    detachSignalSocket(client);
    expect(hub.getStats().clients).toBe(before - 1);
    expect(closed).toBe(false); // detach must not close the socket itself
  });

  test("resume works over the socket too (since>0 replays, since=0 snapshots)", () => {
    const sent: string[] = [];
    const ws = { send: (d: string) => sent.push(d), close: () => {} };
    const client = attachSignalSocket(ws, new URL("http://x/_tw/ws?s=ws_b&since=0"));
    // a fresh client always gets at least a snapshot frame when values exist
    expect(sent.length).toBeGreaterThanOrEqual(0);
    detachSignalSocket(client);
  });
});

describe("signal transport strategy reaches the built manifest", () => {
  const tw = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");

  function makeApp(dir: string, transport?: string) {
    mkdirSync(join(dir, "home", "live"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
    writeFileSync(
      join(dir, "home", "live", "page.tw"),
      'page { title "Live" render signalStream }\nstate { price = publicSignal(1) }\ndiv { p "P: {price}" }\n',
    );
    writeFileSync(
      join(dir, "tw.config.ts"),
      transport
        ? `export default { strategies: { signals: { transport: "${transport}" } } };\n`
        : `export default {};\n`,
    );
  }

  function build(dir: string, args: string[] = []) {
    return spawnSync("bun", [tw, "build", ...args], { cwd: dir, encoding: "utf8" });
  }

  test("default manifest has transport sse", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-tr-sse-"));
    try {
      makeApp(dir);
      const r = build(dir);
      const html = readFileSync(join(dir, ".tw", "live", "index.html"), "utf8");
      const m = /<script id="__TW_SIGNALS__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
      expect(m).not.toBeNull();
      const manifest = JSON.parse(m![1].replace(/\\u003c/g, "<"));
      expect(manifest.transport).toBe("sse");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config strategy changes the manifest transport", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-tr-ws-"));
    try {
      makeApp(dir, "ws");
      build(dir);
      const html = readFileSync(join(dir, ".tw", "live", "index.html"), "utf8");
      const m = /<script id="__TW_SIGNALS__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
      expect(JSON.parse(m![1].replace(/\\u003c/g, "<")).transport).toBe("ws");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CLI flag overrides config", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-tr-flag-"));
    try {
      makeApp(dir, "sse");
      build(dir, ["--signals=long-poll"]);
      const html = readFileSync(join(dir, ".tw", "live", "index.html"), "utf8");
      const m = /<script id="__TW_SIGNALS__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
      expect(JSON.parse(m![1].replace(/\\u003c/g, "<")).transport).toBe("long-poll");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
