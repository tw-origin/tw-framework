/**
 * Signal transports — SSE, WebSocket and long-poll all speak the SAME frame
 * protocol, so a page can switch transport without changing a line of app code.
 *
 *   frame (JSON string) = {"v":1,"seq":N,"updates":[["name",value],...]}
 *                       | {"v":1,"seq":N,"snapshot":{name:value}}
 *
 *   SSE        -> "id: N\ndata: <frame>\n\n"
 *   WebSocket  -> one frame per message (raw JSON string)
 *   long-poll  -> {"v":1,"frames":[<frame>, ...]}  (client re-polls at once)
 *
 * The hub itself is transport-agnostic: every transport just registers a
 * client, overrides `send`, and unregisters on close.
 */
import { getSignalHub, sseFrameWithId } from "./signal-stream";

export type SignalTransportName = "sse" | "ws" | "long-poll";

/** Parse the shared query parameters used by every transport. */
export function parseStreamQuery(request: Request, url: URL) {
  const names = (url.searchParams.get("s") ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  let since = Number(url.searchParams.get("since") ?? "0") || 0;
  // SSE clients resume via the Last-Event-ID header; honour it everywhere.
  if (!since) {
    const lei = Number(request.headers.get("last-event-id") ?? "0") || 0;
    if (lei) since = lei;
  }
  const declared = new Map<string, string>();
  for (const n of names) declared.set(n, "public");

  let session: string | undefined;
  try {
    const header = request.headers.get("cookie") ?? "";
    const m = /(?:^|;\s*)tw_session=([^;]+)/.exec(header);
    if (m) session = decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
  } catch { /* anonymous */ }

  return { names, since, declared, session };
}

/**
 * Long-poll transport: answer immediately when frames are waiting, otherwise
 * hold the request open for up to `maxWaitMs` (default 25s, same as the SSE
 * keep-alive window) and then answer with an empty list. The client re-polls
 * immediately, so this behaves like a stream where streaming is blocked.
 */
export async function createSignalLongPoll(
  request: Request,
  url: URL,
  opts?: { maxWaitMs?: number },
): Promise<Response> {
  const hub = getSignalHub();

  if (url.searchParams.get("stats")) {
    return json(hub.getStats());
  }
  if (!hub.canAcceptClient()) {
    return new Response("Too many signal-stream connections", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Retry-After": "5" },
    });
  }

  const { since, declared, session } = parseStreamQuery(request, url);
  const frames: string[] = [];

  // Resume frames (replay or snapshot) are returned straight away.
  for (const p of hub.connectPayloads(since, declared, session)) frames.push(p);

  const maxWaitMs = opts?.maxWaitMs ?? 25_000;
  const client = hub.register(declared, session);
  try {
    if (frames.length === 0) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(done, maxWaitMs);
        client.send = (payload: string) => { frames.push(payload); done(); };
        try { request.signal?.addEventListener?.("abort", done, { once: true } as any); } catch { /* no signal */ }
      });
    }
  } finally {
    hub.unregister(client.id);
  }

  return json({ v: 1, frames });
}

/**
 * WebSocket transport. Bun serves WebSockets natively; the server's upgrade
 * path calls `attachSignalSocket(ws, url)` once per connection.
 * Returns the hub client so the caller can unregister it on close.
 */
export function attachSignalSocket(ws: { send(data: string): void; close(): void }, url: URL) {
  const hub = getSignalHub();
  const { since, declared, session } = parseStreamQuery(
    { headers: { get: () => null } } as unknown as Request,
    url,
  );

  const client = hub.register(declared, session);
  client.send = (payload: string) => {
    try { ws.send(payload); } catch { try { client.close?.(); } catch { /* gone */ } }
  };
  client.close = () => { try { ws.close(); } catch { /* already closed */ } };

  // Resume: replay missed frames, else one snapshot.
  for (const p of hub.connectPayloads(since, declared, session)) client.send(p);

  return client;
}

/** Unregister a WebSocket's hub client. */
export function detachSignalSocket(client: { id: number } | null): void {
  if (!client) return;
  try { getSignalHub().unregister(client.id); } catch { /* hub gone */ }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Re-export so servers can build SSE frames without importing two modules. */
export { sseFrameWithId };
