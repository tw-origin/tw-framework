/**
 * TW Framework — Node runtime adapter.
 *
 * TW runs natively on Bun. This adapter lets the SAME codebase run on Node.js
 * (18+) by shimming the few Bun APIs the CLI/server use, plus lightweight
 * Web-standard Request/Response classes (avoids undici's WASM per-request
 * overhead entirely):
 *
 *   Bun.serve    -> node:http server with fetch-style handler
 *   Bun.file     -> fs-backed Blob (works with `new Response(file)`)
 *   Bun.gzipSync -> zlib.gzipSync
 *   Bun.spawn    -> child_process.spawnSync
 *   Request/Response -> minimal in-house implementations
 *
 * On Bun this file is a no-op. On Node it installs the shims and flags
 * `globalThis.__TW_NODE = true` so commands can pick runtime-specific paths.
 */

import http from "node:http";
import fsSync from "node:fs";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";

if (typeof globalThis.Bun === "undefined") {
  globalThis.__TW_NODE = true;

  // --- Minimal Web-standard headers/request/response ---------------------

  class TwHeaders {
    m: Map<any, any> = new Map();
    constructor(init) {
      this.m = new Map();
      if (!init) return;
      if (init instanceof TwHeaders) { init.m.forEach((v, k) => this.m.set(k, v)); return; }
      if (Array.isArray(init)) { for (const [k, v] of init) this.m.set(String(k).toLowerCase(), String(v)); return; }
      if (typeof init.forEach === "function") { init.forEach((v, k) => this.m.set(String(k).toLowerCase(), String(v))); return; }
      for (const [k, v] of Object.entries(init)) this.m.set(String(k).toLowerCase(), String(v));
    }
    get(k) { const v = this.m.get(String(k).toLowerCase()); return v == null ? null : (Array.isArray(v) ? v.join(", ") : v); }
    set(k, v) { this.m.set(String(k).toLowerCase(), String(v)); }
    has(k) { return this.m.has(String(k).toLowerCase()); }
    delete(k) { this.m.delete(String(k).toLowerCase()); }
    append(k, v) {
      k = String(k).toLowerCase();
      v = String(v);
      if (!this.m.has(k)) { this.m.set(k, v); return; }
      if (k === "set-cookie") {
        // Set-Cookie must stay one header per cookie -- comma-joining breaks
        // attributes like Expires. Everything else joins per RFC 9110.
        const prev = this.m.get(k);
        this.m.set(k, Array.isArray(prev) ? [...prev, v] : [prev, v]);
      } else {
        this.m.set(k, this.m.get(k) + ", " + v);
      }
    }
    entries() { return this.m.entries(); }
    keys() { return this.m.keys(); }
    values() { return this.m.values(); }
    forEach(fn) { this.m.forEach((v, k) => fn(v, k)); }
    [Symbol.iterator]() { return this.m.entries(); }
  }

  class TwRequest {
    url: any; method: any; headers: any; _body: any; body: any; query: any; params: any = {};
    constructor(url, init) {
      this.url = url;
      this.method = init?.method || "GET";
      this.headers = new TwHeaders(init?.headers);
      this._body = init?.body;
      this.body = this._body;
      try { this.query = new URL(url).searchParams; } catch { this.query = new URLSearchParams(); }
      this.params = {};
    }
    async json() { return JSON.parse(this._body ? this._body.toString("utf-8") : "{}"); }
    /**
     * multipart/form-data (docs/multipart-forms.md): parse the buffered body
     * into a FormData-like object. Route handlers expect request.formData()
     * to exist exactly like the fetch standard on Bun.
     */
    async formData(): Promise<any> {
      const bodyStr = this._body ? this._body.toString("binary") : "";
      const ct = String(this.headers?.get?.("content-type") ?? "");
      const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
      if (!bm) throw new Error("FormData: no multipart boundary");
      const boundary = "--" + (bm[1] ?? bm[2]).trim();
      const out: [string, any][] = [];
      const parts = bodyStr.split(boundary);
      for (let i = 1; i < parts.length - 1; i++) {
        const raw = parts[i];
        const sep = raw.indexOf("\r\n\r\n");
        if (sep < 0) continue;
        const head = raw.slice(0, sep);
        let data = raw.slice(sep + 4);
        if (data.endsWith("\r\n")) data = data.slice(0, -2);
        const nameM = /name="([^"]*)"/.exec(head);
        if (!nameM) continue;
        const fileM = /filename="([^"]*)"/.exec(head);
        const typeM = /content-type:\s*([^\r\n]+)/i.exec(head);
        if (fileM) {
          const buf = Buffer.from(data, "binary");
          out.push([nameM[1], {
            name: fileM[1],
            type: typeM ? typeM[1].trim() : "application/octet-stream",
            size: buf.length,
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          }]);
        } else {
          out.push([nameM[1], data]);
        }
      }
      return {
        entries: () => out[Symbol.iterator](),
        forEach: (fn: any) => out.forEach(([k, v]) => fn(v, k)),
        get: (k: string) => (out.find(([kk]) => kk === k) || [, undefined])[1],
      };
    }
    async text() { return this._body ? this._body.toString("utf-8") : ""; }
    async arrayBuffer() {
      if (!this._body) return new ArrayBuffer(0);
      const b = Buffer.isBuffer(this._body) ? this._body : Buffer.from(this._body);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
  }

  class TwResponse {
    status: any; headers: any; body: any; _body: any; ok: any; statusText: any = ""; url: any = "";
    constructor(body, init) {
      this.status = init?.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new TwHeaders(init?.headers);
      // Keep `.body` in sync: wrappers rebuild responses as
      // `new Response(res.body, {...})` (security headers, config headers).
      // If `.body` were undefined, the rebuilt response would ship headers
      // without a body and Node would wait on Content-Length forever.
      this.body = body;
      this._body = body;
    }
    async arrayBuffer() {
      if (!this._body) return new ArrayBuffer(0);
      const b: any = this._body;
      // Blob (Bun.file) and other web bodies
      if (b && typeof b.arrayBuffer === "function") return await b.arrayBuffer();
      // Web ReadableStream (render stream responses): drain into a buffer.
      if (b && typeof b.getReader === "function") {
        const reader = b.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.byteLength;
        }
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.byteLength; }
        return out.buffer;
      }
      const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
    async text() {
      if (!this._body) return "";
      const ab = await this.arrayBuffer();
      return Buffer.from(ab).toString("utf-8");
    }
    async json() { return JSON.parse(await this.text() || "null"); }
  }

  globalThis.Request = TwRequest as any;
  globalThis.Response = TwResponse as any;

  // --- Bun API shims --------------------------------------------------------

  globalThis.Bun = {
    __isNodeShim: true,

    serve(opts) {
      const port = opts?.port ?? 3000;
      const hostname = opts?.hostname ?? "0.0.0.0";
      const server = http.createServer(async (req, res) => {
        try {
          const url = `http://${req.headers.host || `localhost:${port}`}${req.url || "/"}`;
          const headers = new (TwHeaders as any)();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v === undefined) continue;
            headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
          }
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new TwRequest(url, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
          });
          const response = await opts.fetch(request);
          const outHeaders = {};
          for (const [k, v] of response.headers.entries()) outHeaders[k] = v;
          // Stream ReadableStream bodies chunk-by-chunk. Buffering via
          // arrayBuffer() would HANG forever for persistent streams
          // (signal streaming SSE /_tw/stream never closes).
          const respBody: any = (response as any).body;
          if (respBody && typeof respBody.getReader === "function") {
            res.writeHead(response.status, outHeaders);
            const reader = respBody.getReader();
            const pump = (): void => {
              reader
                .read()
                .then(({ done, value }: { done: boolean; value?: Uint8Array }) => {
                  if (done) { try { res.end(); } catch { /* closed */ } return; }
                  try { res.write(Buffer.from(value ?? [])); } catch { /* client gone */ }
                  pump();
                })
                .catch(() => { try { res.end(); } catch { /* closed */ } });
            };
            pump();
          } else {
            const buf = Buffer.from(await response.arrayBuffer());
            res.writeHead(response.status, outHeaders);
            res.end(buf);
          }
        } catch (err) {
          try { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("Internal Server Error"); } catch { /* closed */ }
          console.error("[tw:node] request error:", err && err.message);
        }
      });
      server.listen(port, hostname);
      return {
        port,
        hostname,
        stop() { server.close(); },
        fetch: opts?.fetch,
      };
    },

    file(path) {
      let data = null;
      try { data = fsSync.readFileSync(path); } catch { data = null; }
      const blob = (data !== null ? new Blob([data]) : new Blob([])) as any;
      blob.exists = async () => data !== null;
      blob.json = async () => JSON.parse(data.toString("utf-8"));
      return blob;
    },

    gzipSync(bytes) {
      return zlib.gzipSync(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    },

    spawn(cmd, opts) {
      const r = spawnSync(cmd[0], cmd.slice(1), {
        cwd: opts?.cwd,
        stdio: opts?.stdout === "inherit" ? "inherit" : "pipe",
        env: process.env,
      });
      return {
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        exitCode: r.status ?? 1,
        exited: Promise.resolve(r.status ?? 1),
        success: r.status === 0,
      };
    },
  } as any;
}
