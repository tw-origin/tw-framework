/**
 * Signal Streaming hub (docs/signal-streaming.md) — the server side of
 * `render signalStream` pages.
 *
 * One hub per server. Route handlers push updates through `setSignal`
 * (injected into `.twm` route modules via `import { setSignal } from "tw"`);
 * connected browsers receive them over a persistent SSE-style HTTP stream
 * (`/_tw/stream`) and patch their signal bindings in place.
 *
 * Protocol (v1):
 *   update:   {"v":1,"seq":1842,"updates":[["price",151.2],...]}
 *   snapshot: {"v":1,"seq":1842,"snapshot":{"price":151.2}}
 *
 * - Updates are batched on a 100ms window, so N setSignal calls inside one
 *   tick arrive as one frame.
 * - A bounded history buffer lets a reconnecting client resume from its last
 *   sequence number (`?since=N`); when the history no longer covers the gap,
 *   the client gets one full snapshot instead.
 * - Permissions: public updates broadcast to every connected client. Private
 *   updates are delivered only to clients whose page declared that signal
 *   (per-user auth binding is the next phase).
 *
 * v2 (signal engine power upgrade):
 * - Connection cap (MAX_CLIENTS, default 500): the 501st stream gets a
 *   clean 503 + Retry-After instead of silently degrading the server.
 * - Value hygiene: signal names are validated ([A-Za-z0-9_$.-]{1,64}) and
 *   values capped at MAX_VALUE_BYTES (64KB) -- one bad setSignal can no
 *   longer blow up every connected client's frame budget.
 * - closeAll(): graceful shutdown closes every stream so sockets free up
 *   immediately on SIGTERM (docker stop / k8s).
 * - Stats counters (getStats) for /_tw/stream?stats=1 observability.
 */

export interface SignalStreamClient {
  id: number;
  /** signal names (with kind) this client's page declared */
  declared: Map<string, string>;
  /** session key (tw_session cookie) for per-user private delivery */
  session?: string;
  send: (payload: string) => void;
  close: () => void;
}

interface HistoryEntry {
  seq: number;
  payload: string;
  names: string[];
  /** set when the update was session-scoped: only that session replays it */
  session?: string;
}

const BATCH_MS = 100;
const HISTORY_LIMIT = 1000;
// v2 caps (overridable via tw.config.ts signalStream: {...})
const MAX_CLIENTS = 500;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_NAME_LEN = 64;
const NAME_RE = /^[A-Za-z0-9_$.-]{1,64}$/;

export class SignalHub {
  private clients = new Map<number, SignalStreamClient>();
  private nextClientId = 1;
  private seq = 0;
  private values = new Map<string, any>();
  private kinds = new Map<string, string>();
  private history: HistoryEntry[] = [];
  private pending = new Map<string, any>();
  private pendingSession: string | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // v2 stats + caps
  private maxClients = MAX_CLIENTS;
  private createdAt = Date.now();
  private totalUpdates = 0;
  private batchesFlushed = 0;
  private rejectedCount = 0;

  /** v2: configure caps (from tw.config.ts signalStream options). */
  configure(opts?: { maxClients?: number; maxHistory?: number }): void {
    if (opts?.maxClients && opts.maxClients > 0) this.maxClients = opts.maxClients;
    if (opts?.maxHistory && opts.maxHistory > 0) this.historyLimit = opts.maxHistory;
  }
  private historyLimit = HISTORY_LIMIT;

  /** v2: observability for /_tw/stream?stats=1 and window.__tw stats. */
  getStats(): Record<string, any> {
    const signals: Record<string, string> = {};
    for (const [n, k] of this.kinds) signals[n] = k;
    return {
      clients: this.clients.size,
      clientCap: this.maxClients,
      seq: this.seq,
      signals,
      valueCount: this.values.size,
      history: this.history.length,
      historyCap: this.historyLimit,
      pending: this.pending.size,
      totalUpdates: this.totalUpdates,
      batchesFlushed: this.batchesFlushed,
      rejected: this.rejectedCount,
      uptimeMs: Date.now() - this.createdAt,
    };
  }

  /** v2: graceful shutdown -- close every connected stream now. */
  closeAll(): void {
    for (const c of [...this.clients.values()]) {
      try { c.close(); } catch { /* already closed */ }
    }
    this.clients.clear();
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    this.pending.clear();
  }

  /** v2: connection cap check BEFORE registering a stream client. */
  canAcceptClient(): boolean {
    return this.clients.size < this.maxClients;
  }

  /** v2: validate a setSignal name/value without throwing. */
  private validateSignal(name: string, value: unknown): string | null {
    if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LEN) {
      return "signal name must be 1-" + MAX_NAME_LEN + " chars";
    }
    if (!NAME_RE.test(name)) return "signal name has invalid characters";
    if (value === undefined) return "signal value is undefined";
    try {
      const size = typeof value === "string" ? value.length : JSON.stringify(value)?.length ?? 0;
      if (size > MAX_VALUE_BYTES) return "signal value exceeds " + MAX_VALUE_BYTES + " bytes";
    } catch { return "signal value is not serializable" }
    return null;
  }

  /**
   * Server-side mutation (route handlers): queue an update, batch-flush.
   * With `session` (derived from the request's tw_session cookie) private
   * signals are delivered only to clients authenticated as that session.
   */
  setSignal(
    name: string,
    value: unknown,
    opts?: { session?: string },
  ): { queued: boolean; kind?: string; error?: string } {
    // v2: validate BEFORE mutating anything -- a rejected setSignal leaves
    // the hub untouched and tells the caller why.
    const invalid = this.validateSignal(name, value);
    if (invalid) {
      this.rejectedCount++;
      return { queued: false, kind: this.kinds.get(name), error: invalid };
    }
    const kind = this.kinds.get(name) ?? "public";
    this.values.set(name, value);
    this.kinds.set(name, kind);
    this.pending.set(name, value);
    if (opts?.session) this.pendingSession = opts.session;
    if (this.timer == null) {
      this.timer = setTimeout(() => this.flush(), BATCH_MS);
    }
    return { queued: true, kind };
  }

  /** Latest known values (also used for fresh snapshots). */
  snapshot(): { seq: number; snapshot: Record<string, any> } {
    return { seq: this.seq, snapshot: Object.fromEntries(this.values) };
  }

  register(declared: Map<string, string>, session?: string): SignalStreamClient {
    const id = this.nextClientId++;
    // Declared signals also become known to the hub so setSignal can route
    // private updates correctly even before the first update.
    for (const [name, kind] of declared) {
      if (!this.kinds.has(name)) this.kinds.set(name, kind);
    }
    const client: SignalStreamClient = {
      id,
      declared,
      session,
      send: () => {},
      close: () => this.clients.delete(id),
    };
    this.clients.set(id, client);
    return client;
  }

  /** v2: remove a stream client (its connection died / was cancelled).
   *  The old handler overwrote client.close() with a closure that only
   *  closed the controller -- the Map entry leaked forever, so every
   *  disconnected browser still occupied a slot (and got flushed frames).
   */
  unregister(id: number): void {
    this.clients.delete(id);
  }

  /** Build the replay/snapshot preamble for a connecting client. */
  connectPayloads(since: number, declared: Map<string, string>, session?: string): string[] {
    const out: string[] = [];
    // v2: a FRESH client (no sequence yet) gets ONE snapshot frame instead
    // of a full history replay -- after N updates a new visitor used to
    // receive all N frames just to learn the current values.
    if (since <= 0 && this.values.size > 0) {
      const snap: Record<string, any> = {};
      for (const [name, value] of this.values) {
        if (this.sessionMatches(session, { names: [name], session: this.valueSessions.get(name) })
            && this.deliversTo(declared, [name])) snap[name] = value;
      }
      if (Object.keys(snap).length > 0) {
        out.push(this.frame({ v: 1, seq: this.seq, snapshot: snap }));
      }
      return out;
    }
    const hasCoverage =
      since <= this.seq && this.history.length > 0 && since >= this.history[0].seq - 1;
    if (hasCoverage) {
      for (const entry of this.history) {
        if (entry.seq > since && this.sessionMatches(session, entry) && this.deliversTo(declared, entry.names)) {
          out.push(entry.payload);
        }
      }
    } else if (this.values.size > 0) {
      // Fresh snapshot of everything this client can see
      const snap: Record<string, any> = {};
      for (const [name, value] of this.values) {
        if (this.sessionMatches(session, { names: [name], session: this.valueSessions.get(name) })
            && this.deliversTo(declared, [name])) snap[name] = value;
      }
      if (Object.keys(snap).length > 0) {
        out.push(this.frame({ v: 1, seq: this.seq, snapshot: snap }));
      }
    }
    return out;
  }

  /** latest-known session per signal (for snapshot filtering) */
  private valueSessions = new Map<string, string | undefined>();

  private sessionMatches(
    clientSession: string | undefined,
    entry: { names: string[]; session?: string },
  ): boolean {
    if (!entry.session) return true; // broadcast update
    return entry.session === clientSession;
  }

  private deliversTo(declared: Map<string, string>, names: string[]): boolean {
    return names.some((n) => {
      const kind = this.kinds.get(n) ?? "public";
      return kind === "public" || declared.has(n);
    });
  }

  private flush(): void {
    this.timer = null;
    if (this.pending.size === 0) return;
    const updates = [...this.pending.entries()];
    const session = this.pendingSession;
    this.pending.clear();
    this.pendingSession = undefined;
    this.seq++;
    const names = updates.map(([n]) => n);
    for (const [n] of updates) this.valueSessions.set(n, session);
    const payload = this.frame({ v: 1, seq: this.seq, updates });
    this.history.push({ seq: this.seq, payload, names, session });
    this.totalUpdates += updates.length;
    this.batchesFlushed++;
    if (this.history.length > this.historyLimit) this.history.shift();
    for (const client of this.clients.values()) {
      if (this.sessionMatches(client.session, { names, session })
          && this.deliversTo(client.declared, names)) client.send(payload);
    }
  }

  private frame(obj: unknown): string {
    return JSON.stringify(obj).replace(/</g, "\\u003c");
  }
}

let hub: SignalHub | null = null;

export function getSignalHub(): SignalHub {
  if (!hub) hub = new SignalHub();
  return hub;
}

/** Server-side signal mutation — the "tw" module export for .twm routes. */
export function setSignal(
  name: string,
  value: unknown,
  opts?: { request?: any; session?: string },
): { queued: boolean; kind?: string } {
  let session = opts?.session;
  if (!session && opts?.request) {
    try {
      const cookies = opts.request.cookies;
      if (cookies && typeof cookies.get === "function") {
        session = cookies.get("tw_session") ?? undefined;
      } else {
        const header = opts.request.headers?.get?.("cookie") ?? "";
        const m = /(?:^|;\s*)tw_session=([^;]+)/.exec(header);
        if (m) session = decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
      }
    } catch { /* no session context */ }
  }
  return getSignalHub().setSignal(name, value, session ? { session } : undefined);
}


// --- v2 endpoint helpers (used by TWServer) ----------------------------------

/** Frame an SSE "data:" chunk WITH an id: line so a stock EventSource
 *  auto-reconnect resumes from the last delivered sequence number. */
export function sseFrameWithId(payload: string): string {
  try {
    const seq = JSON.parse(payload).seq;
    if (typeof seq === "number") return "id: " + seq + "\ndata: " + payload + "\n\n";
  } catch { /* non-JSON payload -- plain data frame */ }
  return "data: " + payload + "\n\n";
}


// --- v2 shared HTTP handlers (used by BOTH `tw serve` and `tw dev`) -----

/**
 * The /_tw/stream SSE endpoint as a Response. Previously this lived only
 * inside TWServer -- `tw dev` had NO signal endpoint at all, so
 * `render signalStream` pages were dead in development. Shared now.
 */
export function createSignalStream(
  request: Request,
  url: URL,
  opts?: { maxClients?: number; maxHistory?: number },
): Response {
  const hub = getSignalHub();
  if (opts && (!(hub as any).__cfg)) {
    (hub as any).__cfg = true;
    try { hub.configure({ maxClients: opts.maxClients, maxHistory: opts.maxHistory }); } catch { /* defaults */ }
  }

  // v2: /_tw/stream?stats=1 -- observability without opening a stream.
  if (url.searchParams.get("stats")) {
    return new Response(JSON.stringify(hub.getStats(), null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // v2: connection cap -- the 501st concurrent stream gets a clean 503
  // with Retry-After instead of degrading the whole server.
  if (!hub.canAcceptClient()) {
    return new Response("Too many signal-stream connections", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Retry-After": "5" },
    });
  }

  const names = (url.searchParams.get("s") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  let since = Number(url.searchParams.get("since") ?? "0") || 0;
  // v2: standard SSE resume -- a stock EventSource auto-reconnects with
  // the Last-Event-ID header; honor it when ?since= is absent.
  if (!since) {
    const lei = Number(request.headers.get("last-event-id") ?? "0") || 0;
    if (lei) since = lei;
  }
  const declared = new Map<string, string>();
  for (const n of names) declared.set(n, "public"); // kind refined on updates
  let session: string | undefined;
  try {
    const header = request.headers.get("cookie") ?? "";
    const m = /(?:^|;\s*)tw_session=([^;]+)/.exec(header);
    if (m) session = decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
  } catch { /* anonymous stream */ }

  const enc = new TextEncoder();
  // v2: every data frame carries an `id: <seq>` line (Last-Event-ID resume)
  const sse = (payload: string) => enc.encode(sseFrameWithId(payload));

  // v2: keep the client + keepAlive handle in the closure so BOTH
  // start() and cancel() can reach them -- cancel() must close ONLY
  // this stream's client (never the whole hub).
  let registered: any = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const client = hub.register(declared, session);
      registered = client;
      const cleanup = () => {
        if (keepAlive) clearInterval(keepAlive);
        hub.unregister(client.id); // v2: free the slot -- this used to leak
        try { controller.close(); } catch { /* already closed */ }
      };
      client.send = (payload: string) => {
        try { controller.enqueue(sse(payload)); } catch { cleanup(); }
      };
      client.close = cleanup;
      // Resume: replay missed updates or send a fresh snapshot
      for (const payload of hub.connectPayloads(since, declared, session)) {
        try { controller.enqueue(sse(payload)); } catch { break; }
      }
      // Keep-alive comment every 25s so proxies do not idle the connection
      keepAlive = setInterval(() => {
        // v2: a dead connection throws here -- clean the slot up too
        // (the old code only cleared the interval and leaked the client).
        try { controller.enqueue(enc.encode(": keep-alive\n\n")); } catch { cleanup(); }
      }, 25000);
    },
    // v2: when the browser drops the connection (tab close, network
    // loss) cancel fires -- remove THIS hub entry immediately instead
    // of waiting for the next failed send.
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      try { registered?.close?.(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

/**
 * v2: the POST /_tw/signal client->server push endpoint. OFF by default;
 * enable with tw.config.ts `signalStream: { clientWrites: true }`. Only
 * PUBLIC signals can be written this way -- private/session signals stay
 * server-only. Hub size/name validation still applies.
 */
export async function writeSignalFromClient(
  request: Request,
  opts: { clientWrites?: boolean },
): Promise<Response> {
  if (!opts?.clientWrites) {
    return new Response(JSON.stringify({ error: "client signal writes are disabled" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  let body: any = null;
  try { body = await request.json(); } catch { /* fall through */ }
  const name = body?.name;
  if (typeof name !== "string" || !("value" in (body ?? {}))) {
    return new Response(JSON.stringify({ error: "body must be { name, value }" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  const hub = getSignalHub();
  // public-only guard: private/session signals must never be client-writable
  const kind = (hub.getStats().signals ?? {})[name];
  if (kind && kind !== "public") {
    return new Response(JSON.stringify({ error: "only public signals are client-writable" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const res = hub.setSignal(name, body.value);
  if (!res.queued) {
    return new Response(JSON.stringify({ error: res.error ?? "rejected" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, kind: res.kind }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
}
