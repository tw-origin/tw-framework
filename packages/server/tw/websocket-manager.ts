/**
 * WebSocketManager — docs/websocket-server.md.
 *
 * Per-server instance that tracks every open socket, its metadata and the
 * room registry. Connections are plain duck-typed sockets: anything with
 * a `send(data)` method works (Bun `ws`, node `WebSocket`, fakes in tests).
 */

export interface WebSocketConnection {
  id?: string;
  data?: { id?: string; [k: string]: unknown };
  readyState?: number;
  send(data: string): unknown;
}

export interface ConnectionMeta {
  userId?: string | number;
  session?: unknown;
  [k: string]: unknown;
}

interface RoomEntry {
  name: string;
  metadata: Record<string, unknown>;
  members: Set<string>;
}

const DEFAULT_MAX_ROOMS = 1000;
const DEFAULT_MAX_ROOM_SIZE = 10000;

export class WebSocketManager {
  private connections = new Map<string, WebSocketConnection>();
  private meta = new Map<string, ConnectionMeta>();
  private rooms = new Map<string, RoomEntry>();
  private nextId = 1;
  private maxRooms: number;
  private maxRoomSize: number;

  constructor(options: { maxRooms?: number; maxRoomSize?: number } = {}) {
    this.maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
    this.maxRoomSize = options.maxRoomSize ?? DEFAULT_MAX_ROOM_SIZE;
  }

  /** Register a socket on open; returns the assigned connection id. */
  add(connection: WebSocketConnection, meta: ConnectionMeta = {}): string {
    let id = connection?.data?.id ?? connection?.id;
    if (!id) {
      id = "ws-" + process.pid + "-" + this.nextId++;
    }
    // The documented wiring reads `ws.data.id` after add(); make sure it is set.
    if (connection && typeof connection === "object") {
      if (!connection.data) connection.data = { id };
      else if (!connection.data.id) connection.data.id = id;
      if (!connection.id) connection.id = id;
    }
    this.connections.set(id, connection);
    this.meta.set(id, meta);
    return id;
  }

  /** Lookup by connection id. */
  get(id: string): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  /** Deregister on close; auto-leaves rooms (last member out kills the room). */
  remove(id: string): boolean {
    for (const room of this.rooms.values()) {
      room.members.delete(id);
      if (room.members.size === 0) this.rooms.delete(room.name);
    }
    this.meta.delete(id);
    return this.connections.delete(id);
  }

  /** Serialize once and send to every socket regardless of room membership. */
  broadcast(payload: unknown): void {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    for (const conn of this.connections.values()) {
      this.safeSend(conn, data);
    }
  }

  /** Send to one connection. */
  send(id: string, payload: unknown): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    this.safeSend(conn, typeof payload === "string" ? payload : JSON.stringify(payload));
    return true;
  }

  /** All live entries. */
  getConnections(): { id: string; meta: ConnectionMeta }[] {
    return [...this.connections.keys()].map((id) => ({ id, meta: this.meta.get(id) ?? {} }));
  }

  /** Explicit pre-creation with metadata (rooms also auto-create on join). */
  createRoom(name: string, metadata: Record<string, unknown> = {}): void {
    if (this.rooms.has(name)) return;
    if (this.rooms.size >= this.maxRooms) {
      throw new Error(`maxRooms reached (${this.maxRooms}): cannot create "${name}"`);
    }
    this.rooms.set(name, { name, metadata, members: new Set() });
  }

  /** Join a room (auto-creates). A full room refuses joins. */
  joinRoom(connectionId: string, name: string): boolean {
    if (!this.connections.has(connectionId)) return false;
    let room = this.rooms.get(name);
    if (!room) {
      if (this.rooms.size >= this.maxRooms) {
        throw new Error(`maxRooms reached (${this.maxRooms}): cannot create "${name}"`);
      }
      room = { name, metadata: {}, members: new Set() };
      this.rooms.set(name, room);
    }
    if (room.members.size >= this.maxRoomSize) return false;
    room.members.add(connectionId);
    return true;
  }

  /** Leave a room; the room disappears when its last member leaves. */
  leaveRoom(connectionId: string, name: string): boolean {
    const room = this.rooms.get(name);
    if (!room) return false;
    const had = room.members.delete(connectionId);
    if (room.members.size === 0) this.rooms.delete(name);
    return had;
  }

  /** Iterate only that room's members — Set membership guarantees exactly one copy. */
  broadcastToRoom(name: string, payload: unknown): number {
    const room = this.rooms.get(name);
    if (!room) return 0;
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    let sent = 0;
    for (const id of room.members) {
      const conn = this.connections.get(id);
      if (this.safeSend(conn, data)) sent++;
    }
    return sent;
  }

  /** Room + members. */
  getRoom(name: string): { name: string; metadata: Record<string, unknown>; members: string[] } | undefined {
    const room = this.rooms.get(name);
    if (!room) return undefined;
    return { name: room.name, metadata: room.metadata, members: [...room.members] };
  }

  /** All rooms. */
  getRooms(): { name: string; members: number }[] {
    return [...this.rooms.values()].map((r) => ({ name: r.name, members: r.members.size }));
  }

  private safeSend(conn: WebSocketConnection | undefined, data: string): boolean {
    try {
      if (!conn || typeof conn?.send !== "function") return false;
      // Skip sockets that are visibly not open (0 CONNECTING, 2 CLOSING, 3 CLOSED).
      if (typeof conn.readyState === "number" && conn.readyState !== 1) return false;
      conn.send(data);
      return true;
    } catch {
      return false;
    }
  }
}
