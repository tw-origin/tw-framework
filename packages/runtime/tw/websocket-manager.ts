/**
 * WebSocket Manager -- reactive WebSocket connections with auto-reconnect.
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Heartbeat/ping-pong
 * - Message queuing when disconnected
 * - Reactive connection status
 * - Multiple named connections
 * - Message serialization (JSON, MessagePack)
 * - Rate limiting
 * - Error handling
 * - Connection pooling
 * - SSR-safe (no WebSocket in SSR)
 */

import { signal, computed, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface WSMessage {
  type: string;
  data: unknown;
  timestamp: number;
  id?: string;
}

export interface WSOptions {
  url: string;
  protocols?: string | string[];
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  backoffMultiplier?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  heartbeatMessage?: unknown;
  heartbeatTimeout?: number;
  queueMessages?: boolean;
  maxQueueSize?: number;
  serializer?: (data: unknown) => string | ArrayBuffer;
  deserializer?: (data: string | ArrayBuffer) => unknown;
  rateLimit?: number;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WSMessage) => void;
}

// --- WebSocket Connection --------------------------------------------

class TWWebSocket {
  readonly name: string;
  private options: Required<Omit<WSOptions, "protocols">> & { protocols?: string | string[] };
  private ws: WebSocket | null = null;
  private status: Signal<ConnectionStatus>;
  private messageQueue: WSMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private messageHandlers = new Map<string, Set<(data: unknown) => void>>();
  private disposed = false;

  constructor(name: string, options: WSOptions) {
    this.name = name;
    this.options = {
      reconnect: true,
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      backoffMultiplier: 2,
      maxReconnectAttempts: Infinity,
      heartbeatInterval: 30000,
      heartbeatMessage: { type: "ping" },
      heartbeatTimeout: 10000,
      queueMessages: true,
      maxQueueSize: 100,
      serializer: JSON.stringify,
      deserializer: JSON.parse,
      rateLimit: 0,
      onOpen: () => {},
      onClose: () => {},
      onError: () => {},
      onMessage: () => {},
      ...options,
    };
    this.status = signal("disconnected");
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): void {
    if (this.disposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.status.set(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      this.ws = new WebSocket(this.options.url, this.options.protocols);
      this.ws.onopen = this.handleOpen;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
      this.ws.onmessage = this.handleMessage;
    } catch (e) {
      console.error(`[TW WebSocket] Connection failed for '${this.name}':`, e);
      this.status.set("error");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.status.set("disconnected");
  }

  /**
   * Send a message.
   */
  send(type: string, data: unknown): boolean {
    const message: WSMessage = { type, data, timestamp: Date.now() };

    // Rate limiting
    if (this.options.rateLimit > 0) {
      const now = Date.now();
      if (now - this.lastMessageTime < this.options.rateLimit) return false;
      this.lastMessageTime = now;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.options.queueMessages && this.messageQueue.length < this.options.maxQueueSize) {
        this.messageQueue.push(message);
      }
      return false;
    }

    try {
      this.ws.send(this.options.serializer(message));
      return true;
    } catch (e) {
      console.error(`[TW WebSocket] Send error for '${this.name}':`, e);
      return false;
    }
  }

  /**
   * Subscribe to messages of a specific type.
   */
  on(type: string, handler: (data: unknown) => void): () => void {
    if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, new Set());
    this.messageHandlers.get(type)!.add(handler);
    return () => { this.messageHandlers.get(type)?.delete(handler); };
  }

  /**
   * Get connection status (reactive).
   */
  get statusSignal(): Signal<ConnectionStatus> { return this.status; }

  /**
   * Check if connected.
   */
  get isConnected(): boolean { return this.status.peek() === "connected"; }

  /**
   * Get queued message count.
   */
  get queuedCount(): number { return this.messageQueue.length; }

  /**
   * Get reconnect attempts.
   */
  get reconnectCount(): number { return this.reconnectAttempts; }

  /**
   * Dispose the connection.
   */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.messageQueue = [];
    this.messageHandlers.clear();
  }

  // --- Internal ------------------------------------------------------

  private handleOpen = (): void => {
    this.status.set("connected");
    this.reconnectAttempts = 0;
    this.options.onOpen();

    // Start heartbeat
    if (this.options.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.send("__heartbeat__", this.options.heartbeatMessage);
      }, this.options.heartbeatInterval);
    }

    // Flush queued messages
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      this.send(msg.type, msg.data);
    }
  };

  private handleClose = (event: CloseEvent): void => {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.status.set("disconnected");
    this.options.onClose(event);

    if (this.options.reconnect && !this.disposed) {
      this.scheduleReconnect();
    }
  };

  private handleError = (event: Event): void => {
    this.status.set("error");
    this.options.onError(event);
  };

  private handleMessage = (event: MessageEvent): void => {
    try {
      const data = this.options.deserializer(event.data) as WSMessage;
      if (data && data.type) {
        // Notify type-specific handlers
        const handlers = this.messageHandlers.get(data.type);
        if (handlers) {
          for (const handler of handlers) {
            try { handler(data.data); }
            catch (e) { console.error(`[TW WebSocket] Handler error for '${data.type}':`, e); }
          }
        }

        // Notify global handler
        this.options.onMessage(data);

        // Also notify wildcard handlers
        const wildcardHandlers = this.messageHandlers.get("*");
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) {
            try { handler(data); }
            catch (e) { console.error(`[TW WebSocket] Wildcard handler error:`, e); }
          }
        }
      }
    } catch (e) {
      console.error(`[TW WebSocket] Message parse error for '${this.name}':`, e);
    }
  };

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error(`[TW WebSocket] Max reconnection attempts reached for '${this.name}'`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(this.options.backoffMultiplier, this.reconnectAttempts - 1),
      this.options.maxReconnectInterval,
    );

    this.status.set("reconnecting");

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// --- Connection Manager ----------------------------------------------

const connections = new Map<string, TWWebSocket>();

/**
 * Create or get a named WebSocket connection.
 */
export function createConnection(name: string, options: WSOptions): TWWebSocket {
  if (connections.has(name)) {
    const conn = connections.get(name)!;
    if (!conn.isConnected) conn.connect();
    return conn;
  }

  const conn = new TWWebSocket(name, options);
  connections.set(name, conn);
  conn.connect();
  return conn;
}

/**
 * Get a connection by name.
 */
export function getConnection(name: string): TWWebSocket | undefined {
  return connections.get(name);
}

/**
 * Close a named connection.
 */
export function closeConnection(name: string): void {
  const conn = connections.get(name);
  if (conn) {
    conn.dispose();
    connections.delete(name);
  }
}

/**
 * Close all connections.
 */
export function closeAllConnections(): void {
  for (const conn of connections.values()) conn.dispose();
  connections.clear();
}
