/**
 * JSON-RPC 2.0 -- message parsing, serialization, and transport.
 * @module lsp/server/json-rpc
 */

export interface RPCRequest { jsonrpc: "2.0"; id: number | string; method: string; params?: unknown; }
export interface RPCResponse { jsonrpc: "2.0"; id: number | string; result?: unknown; error?: RPCError; }
export interface RPCError { code: number; message: string; data?: unknown; }
export interface RPCNotification { jsonrpc: "2.0"; method: string; params?: unknown; }
export type RPCMessage = RPCRequest | RPCResponse | RPCNotification;

export const RPCErrorCodes = {
  ParseError: -32700, InvalidRequest: -32600, MethodNotFound: -32601,
  InvalidParams: -32602, InternalError: -32603, ServerNotInitialized: -32002,
  UnknownErrorCode: -32001, RequestCancelled: -32800, ContentModified: -32801, RequestFailed: -32803,
} as const;

export type RequestHandler = (params: unknown) => unknown | Promise<unknown>;
export type NotificationHandler = (params: unknown) => void | Promise<void>;

export function createError(code: number, message: string, data?: unknown): RPCError { return { code, message, data }; }

export function parseMessage(data: string): RPCMessage | null {
  try {
    const p = JSON.parse(data);
    if (!p || p.jsonrpc !== "2.0") return null;
    if ("method" in p && "id" in p) return p as RPCRequest;
    if ("method" in p) return p as RPCNotification;
    if ("id" in p && ("result" in p || "error" in p)) return p as RPCResponse;
    return null;
  } catch { return null; }
}

export function serializeMessage(msg: RPCMessage): string { return JSON.stringify(msg); }

export class MessageHandler {
  private requestHandlers: Map<string, RequestHandler> = new Map();
  private notificationHandlers: Map<string, NotificationHandler> = new Map();
  private sendFn: (message: string) => void;
  private pendingRequests: Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private nextId: number = 1;

  constructor(sendFn: (message: string) => void) { this.sendFn = sendFn; }
  onRequest(method: string, handler: RequestHandler): void { this.requestHandlers.set(method, handler); }
  onNotification(method: string, handler: NotificationHandler): void { this.notificationHandlers.set(method, handler); }

  async handleMessage(data: string): Promise<void> {
    const msg = parseMessage(data);
    if (!msg) { this.sendResponse(0, null, createError(RPCErrorCodes.ParseError, "Parse error")); return; }
    if ("method" in msg && "id" in msg) await this.handleRequest(msg as RPCRequest);
    else if ("method" in msg) await this.handleNotification(msg as RPCNotification);
  }

  private async handleRequest(req: RPCRequest): Promise<void> {
    const handler = this.requestHandlers.get(req.method);
    if (!handler) { this.sendResponse(req.id, null, createError(RPCErrorCodes.MethodNotFound, `Method not found: ${req.method}`)); return; }
    try { const result = await handler(req.params); this.sendResponse(req.id, result, null); }
    catch (err) { this.sendResponse(req.id, null, createError(RPCErrorCodes.InternalError, err instanceof Error ? err.message : "Internal error")); }
  }

  private async handleNotification(notif: RPCNotification): Promise<void> {
    const handler = this.notificationHandlers.get(notif.method);
    if (handler) { try { await handler(notif.params); } catch { /* ignore */ } }
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const request: RPCRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendFn(serializeMessage(request));
      setTimeout(() => { if (this.pendingRequests.has(id)) { this.pendingRequests.delete(id); reject(new Error(`Request timed out: ${method}`)); } }, 30000);
    });
  }

  sendNotification(method: string, params?: unknown): void { this.sendFn(serializeMessage({ jsonrpc: "2.0", method, params })); }

  private sendResponse(id: number | string, result: unknown, error: RPCError | null): void {
    const response: RPCResponse = { jsonrpc: "2.0", id };
    if (error) response.error = error; else response.result = result;
    this.sendFn(serializeMessage(response));
  }
}

export class StdioTransport {
  private handler: MessageHandler;
  private buffer: string = "";
  constructor(handler: MessageHandler) { this.handler = handler; }

  start(): void {
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => { this.buffer += chunk; this.processBuffer(); });
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const headers = this.buffer.slice(0, headerEnd);
      const clm = headers.match(/Content-Length:\s*(\d+)/i);
      if (!clm) { this.buffer = this.buffer.slice(headerEnd + 4); continue; }
      const cl = parseInt(clm[1], 10); const cs = headerEnd + 4;
      if (this.buffer.length < cs + cl) break;
      const content = this.buffer.slice(cs, cs + cl);
      this.buffer = this.buffer.slice(cs + cl);
      this.handler.handleMessage(content);
    }
  }

  send(message: string): void { process.stdout.write(`Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`); }
  stop(): void { process.stdin.removeAllListeners("data"); }
}
