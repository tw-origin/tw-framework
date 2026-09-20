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

  /**
   * Server-side mutation (route handlers): queue an update, batch-flush.
   * With `session` (derived from the request's tw_session cookie) private
   * signals are delivered only to clients authenticated as that session.
   */
  setSignal(
    name: string,
    value: unknown,
    opts?: { session?: string },
  ): { queued: boolean; kind?: string } {
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

  /** Build the replay/snapshot preamble for a connecting client. */
  connectPayloads(since: number, declared: Map<string, string>, session?: string): string[] {
    const out: string[] = [];
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
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
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
