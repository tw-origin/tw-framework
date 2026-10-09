/**
 * Edge runtime adapter (strategies.api.runtime = "edge").
 *
 * The build guard (checkEdgeSafety) stops a Node-only module from being
 * imported. This is the runtime half: it actually runs a handler under the
 * edge contract --
 *
 *   - the handler receives a Web-standard Request and returns a Web Response
 *     (or the framework's { status, json|body, headers } shape);
 *   - Node-only globals are removed for the duration of the call, so touching
 *     `process`/`fs`/`require` fails loudly instead of working on Node and
 *     breaking on a real edge platform;
 *   - a per-request timeout and a response-size cap are enforced.
 *
 * The globals are patched per call and restored in `finally`, and calls are
 * serialised so two concurrent edge requests never see each other's patch.
 */

/** Node-only globals an edge function must not depend on. */
export const EDGE_BLOCKED_GLOBALS = [
  "process",
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "global",
  "Buffer",
  "setImmediate",
] as const;

export interface EdgeLimits {
  /** Wall-clock budget for the handler. */
  timeoutMs?: number;
  /** Largest response body allowed, in bytes. */
  maxResponseBytes?: number;
}

export interface EdgeResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function blocked(name: string): never {
  const err: any = new Error(
    `api.runtime=edge: "${name}" is not available on the edge. ` +
    `Use a Web-standard API (fetch, crypto, Request/Response) or switch to api.runtime=node.`,
  );
  err.code = "EDGE_UNSAFE_RUNTIME";
  throw err;
}

// A single-slot queue keeps the global patch exclusive across concurrent calls.
let chain: Promise<unknown> = Promise.resolve();

/** Run `fn` with every Node-only global removed. */
export async function runWithEdgeGlobals<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = async (): Promise<T> => {
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const name of EDGE_BLOCKED_GLOBALS) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      try {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          get() { return blocked(name); },
          set() { /* ignore writes */ },
        });
      } catch { /* a non-configurable global cannot be shadowed; the build guard covers it */ }
    }
    try {
      return await fn();
    } finally {
      for (const [name, desc] of saved) {
        try {
          if (desc) Object.defineProperty(globalThis, name, desc);
          else delete (globalThis as any)[name];
        } catch { /* restore best-effort */ }
      }
    }
  };
  const next = chain.then(run, run);
  chain = next.then(() => undefined, () => undefined);
  return next;
}

/** Normalise whatever the handler returned into an EdgeResult. */
async function toEdgeResult(out: unknown): Promise<EdgeResult> {
  if (out instanceof Response) {
    const headers: Record<string, string> = {};
    out.headers.forEach((v, k) => { headers[k] = v; });
    return { status: out.status, headers, body: await out.text() };
  }
  if (out && typeof out === "object") {
    const o = out as any;
    // A result shape carries one of these keys; anything else is a plain
    // JSON body the handler chose to return.
    const isResultShape = "status" in o || "json" in o || "body" in o || "text" in o || "html" in o || "headers" in o;
    if (!isResultShape) {
      return { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) };
    }
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(o.headers ?? {}) };
    let body: string;
    if (o.body !== undefined && typeof o.body === "string") body = o.body;
    else if (o.text !== undefined) body = String(o.text);
    else if (o.html !== undefined) { body = String(o.html); headers["Content-Type"] = "text/html; charset=utf-8"; }
    else body = JSON.stringify(o.json ?? {});
    return { status: o.status ?? 200, headers, body };
  }
  return { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out ?? {}) };
}

export interface EdgeAdapter {
  (request: any, ctx?: unknown): Promise<EdgeResult>;
}

/**
 * Wrap a handler so it runs under the edge contract.
 * `handler(request: Request, ctx) -> Response | { status, json, ... }`.
 */
export function createEdgeAdapter(
  handler: (request: Request, ctx: unknown) => unknown,
  limits: EdgeLimits = {},
): EdgeAdapter {
  const timeoutMs = limits.timeoutMs ?? 10_000;
  const maxBytes = limits.maxResponseBytes ?? 1_000_000;

  return async function edgeAdapter(request: any, ctx: unknown): Promise<EdgeResult> {
    // Build a Web-standard Request the handler can use as-is.
    const webRequest: Request = request instanceof Request ? request : new Request(
      String(request?.url ?? "http://edge.local/"),
      { method: request?.method ?? "GET", headers: request?.headers ?? {} },
    );

    const result = await runWithEdgeGlobals(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err: any = new Error(`api.runtime=edge: handler exceeded ${timeoutMs}ms`);
          err.code = "EDGE_TIMEOUT";
          reject(err);
        }, timeoutMs);
      });
      try {
        return await Promise.race([Promise.resolve(handler(webRequest, ctx)), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });

    const edge = await toEdgeResult(result);
    const size = new TextEncoder().encode(edge.body).length;
    if (size > maxBytes) {
      const err: any = new Error(`api.runtime=edge: response ${size}B exceeds the ${maxBytes}B cap`);
      err.code = "EDGE_RESPONSE_TOO_LARGE";
      throw err;
    }
    return edge;
  };
}
