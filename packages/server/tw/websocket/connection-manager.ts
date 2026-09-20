/**
 * WebSocket connection manager -- handles connections, rooms, broadcasting.
 * @module server/websocket
 */

export interface WebSocketConnection {
  id: string;
  socket: WebSocket;
  userId?: string;
  rooms: Set<string>;
  metadata: Record<string, unknown>;
  connectedAt: number;
  lastPing: number;
  isAlive: boolean;
}

export interface WebSocketMessage {
  type: string;
  data: unknown;
  roomId?: string;
  userId?: string;
  timestamp: number;
}

export interface WebSocketRoom {
  name: string;
  members: Set<string>;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface ConnectionManagerOptions {
  pingInterval?: number;
  pingTimeout?: number;
  maxConnections?: number;
  maxRooms?: number;
  maxRoomSize?: number;
}

export class WebSocketConnectionManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private rooms: Map<string, WebSocketRoom> = new Map();
  private options: Required<ConnectionManagerOptions>;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private messageHandlers: Map<string, Array<(message: WebSocketMessage, connection: WebSocketConnection) => void>> = new Map();
  private connectionHandlers: Array<(connection: WebSocketConnection) => void> = [];
  private disconnectionHandlers: Array<(connection: WebSocketConnection) => void> = [];
  private stats = { totalConnections: 0, totalMessages: 0, totalBroadcasts: 0, errors: 0 };

  constructor(options: ConnectionManagerOptions = {}) {
    this.options = {
      pingInterval: options.pingInterval ?? 30000,
      pingTimeout: options.pingTimeout ?? 60000,
      maxConnections: options.maxConnections ?? 10000,
      maxRooms: options.maxRooms ?? 1000,
      maxRoomSize: options.maxRoomSize ?? 1000,
    };
  }

  addConnection(id: string, socket: WebSocket, metadata?: Record<string, unknown>): WebSocketConnection {
    if (this.connections.size >= this.options.maxConnections) {
      throw new Error("Max connections exceeded");
    }
    const connection: WebSocketConnection = {
      id,
      socket,
      rooms: new Set(),
      metadata: metadata ?? {},
      connectedAt: Date.now(),
      lastPing: Date.now(),
      isAlive: true,
    };
    this.connections.set(id, connection);
    this.stats.totalConnections++;
    this.connectionHandlers.forEach((handler) => handler(connection));
    this.startPingCheck();
    return connection;
  }

  removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    for (const roomName of connection.rooms) {
      this.leaveRoom(id, roomName);
    }
    this.connections.delete(id);
    this.disconnectionHandlers.forEach((handler) => handler(connection));
  }

  getConnection(id: string): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  getConnections(): WebSocketConnection[] {
    return [...this.connections.values()];
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getActiveConnections(): WebSocketConnection[] {
    return [...this.connections.values()].filter((c) => c.isAlive);
  }

  getActiveConnectionCount(): number {
    return this.getActiveConnections().length;
  }

  setUserId(connectionId: string, userId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.userId = userId;
    }
  }

  setMetadata(connectionId: string, key: string, value: unknown): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.metadata[key] = value;
    }
  }

  getMetadata(connectionId: string, key: string): unknown {
    return this.connections.get(connectionId)?.metadata[key];
  }

  createRoom(name: string, metadata?: Record<string, unknown>): WebSocketRoom {
    if (this.rooms.size >= this.options.maxRooms) {
      throw new Error("Max rooms exceeded");
    }
    if (this.rooms.has(name)) {
      return this.rooms.get(name)!;
    }
    const room: WebSocketRoom = {
      name,
      members: new Set(),
      metadata: metadata ?? {},
      createdAt: Date.now(),
    };
    this.rooms.set(name, room);
    return room;
  }

  removeRoom(name: string): void {
    const room = this.rooms.get(name);
    if (!room) return;
    for (const memberId of room.members) {
      const connection = this.connections.get(memberId);
      if (connection) {
        connection.rooms.delete(name);
      }
    }
    this.rooms.delete(name);
  }

  joinRoom(connectionId: string, roomName: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;
    let room = this.rooms.get(roomName);
    if (!room) {
      room = this.createRoom(roomName);
    }
    if (room.members.size >= this.options.maxRoomSize) {
      return false;
    }
    room.members.add(connectionId);
    connection.rooms.add(roomName);
    return true;
  }

  leaveRoom(connectionId: string, roomName: string): boolean {
    const connection = this.connections.get(connectionId);
    const room = this.rooms.get(roomName);
    if (!connection || !room) return false;
    room.members.delete(connectionId);
    connection.rooms.delete(roomName);
    if (room.members.size === 0) {
      this.rooms.delete(roomName);
    }
    return true;
  }

  getRoom(name: string): WebSocketRoom | undefined {
    return this.rooms.get(name);
  }

  getRooms(): WebSocketRoom[] {
    return [...this.rooms.values()];
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoomMembers(roomName: string): WebSocketConnection[] {
    const room = this.rooms.get(roomName);
    if (!room) return [];
    return [...room.members].map((id) => this.connections.get(id)).filter(Boolean) as WebSocketConnection[];
  }

  getRoomMemberCount(roomName: string): number {
    return this.rooms.get(roomName)?.members.size ?? 0;
  }

  getRoomsForConnection(connectionId: string): string[] {
    return [...(this.connections.get(connectionId)?.rooms ?? [])];
  }

  sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAlive) return false;
    try {
      connection.socket.send(JSON.stringify(message));
      this.stats.totalMessages++;
      return true;
    } catch {
      this.stats.errors++;
      connection.isAlive = false;
      return false;
    }
  }

  sendToRoom(roomName: string, message: WebSocketMessage, excludeConnectionId?: string): number {
    const room = this.rooms.get(roomName);
    if (!room) return 0;
    let sent = 0;
    for (const memberId of room.members) {
      if (memberId !== excludeConnectionId) {
        if (this.sendToConnection(memberId, { ...message, roomId: roomName })) {
          sent++;
        }
      }
    }
    return sent;
  }

  broadcast(message: WebSocketMessage, excludeConnectionId?: string): number {
    let sent = 0;
    for (const [id, connection] of this.connections) {
      if (id !== excludeConnectionId && connection.isAlive) {
        if (this.sendToConnection(id, message)) {
          sent++;
        }
      }
    }
    this.stats.totalBroadcasts++;
    return sent;
  }

  broadcastToUsers(userIds: string[], message: WebSocketMessage): number {
    let sent = 0;
    for (const connection of this.connections.values()) {
      if (connection.userId && userIds.includes(connection.userId)) {
        if (this.sendToConnection(connection.id, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  broadcastToRoom(roomName: string, message: WebSocketMessage): number {
    return this.sendToRoom(roomName, message);
  }

  broadcastExclude(roomName: string, message: WebSocketMessage, excludeConnectionId: string): number {
    return this.sendToRoom(roomName, message, excludeConnectionId);
  }

  onMessage(type: string, handler: (message: WebSocketMessage, connection: WebSocketConnection) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) handlers.splice(index, 1);
      }
    };
  }

  onConnect(handler: (connection: WebSocketConnection) => void): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      const index = this.connectionHandlers.indexOf(handler);
      if (index !== -1) this.connectionHandlers.splice(index, 1);
    };
  }

  onDisconnect(handler: (connection: WebSocketConnection) => void): () => void {
    this.disconnectionHandlers.push(handler);
    return () => {
      const index = this.disconnectionHandlers.indexOf(handler);
      if (index !== -1) this.disconnectionHandlers.splice(index, 1);
    };
  }

  handleMessage(connection: WebSocketConnection, data: string): void {
    try {
      const message = JSON.parse(data) as WebSocketMessage;
      message.timestamp = Date.now();
      message.userId = connection.userId;
      const handlers = this.messageHandlers.get(message.type) ?? [];
      for (const handler of handlers) {
        handler(message, connection);
      }
      const allHandlers = this.messageHandlers.get("*") ?? [];
      for (const handler of allHandlers) {
        handler(message, connection);
      }
    } catch {
      this.stats.errors++;
    }
  }

  private startPingCheck(): void {
    if (this.pingIntervalId) return;
    this.pingIntervalId = setInterval(() => {
      const now = Date.now();
      for (const [id, connection] of this.connections) {
        if (now - connection.lastPing > this.options.pingTimeout) {
          connection.isAlive = false;
          this.removeConnection(id);
        } else {
          try {
            connection.socket.send(JSON.stringify({ type: "ping", timestamp: now }));
          } catch {
            connection.isAlive = false;
          }
        }
      }
    }, this.options.pingInterval);
  }

  stopPingCheck(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  getStats(): { totalConnections: number; totalMessages: number; totalBroadcasts: number; errors: number; currentConnections: number; currentRooms: number } {
    return {
      ...this.stats,
      currentConnections: this.connections.size,
      currentRooms: this.rooms.size,
    };
  }

  resetStats(): void {
    this.stats = { totalConnections: 0, totalMessages: 0, totalBroadcasts: 0, errors: 0 };
  }

  shutdown(): void {
    this.stopPingCheck();
    for (const connection of this.connections.values()) {
      try {
        connection.socket.close();
      } catch (e) {
        console.warn("[TW] Silent catch:", e);
      }
    }
    this.connections.clear();
    this.rooms.clear();
    this.messageHandlers.clear();
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
  }

  getConnectionByUserId(userId: string): WebSocketConnection | undefined {
    return [...this.connections.values()].find((c) => c.userId === userId);
  }

  getConnectionsByUserId(userId: string): WebSocketConnection[] {
    return [...this.connections.values()].filter((c) => c.userId === userId);
  }

  getConnectionIds(): string[] {
    return [...this.connections.keys()];
  }

  getRoomNames(): string[] {
    return [...this.rooms.keys()];
  }

  hasConnection(id: string): boolean {
    return this.connections.has(id);
  }

  hasRoom(name: string): boolean {
    return this.rooms.has(name);
  }

  isInRoom(connectionId: string, roomName: string): boolean {
    return this.connections.get(connectionId)?.rooms.has(roomName) ?? false;
  }

  getUserConnectionsCount(userId: string): number {
    return this.getConnectionsByUserId(userId).length;
  }

  getRoomSize(roomName: string): number {
    return this.getRoomMemberCount(roomName);
  }

  getRoomMetadata(roomName: string, key: string): unknown {
    return this.rooms.get(roomName)?.metadata[key];
  }

  setRoomMetadata(roomName: string, key: string, value: unknown): void {
    const room = this.rooms.get(roomName);
    if (room) {
      room.metadata[key] = value;
    }
  }

  getConnectionMetadata(connectionId: string): Record<string, unknown> {
    return this.connections.get(connectionId)?.metadata ?? {};
  }

  getAllMetadata(connectionId: string): Record<string, unknown> {
    return this.getConnectionMetadata(connectionId);
  }

  clearMetadata(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.metadata = {};
    }
  }

  clearRoomMetadata(roomName: string): void {
    const room = this.rooms.get(roomName);
    if (room) {
      room.metadata = {};
    }
  }

  getOldestConnection(): WebSocketConnection | undefined {
    return [...this.connections.values()].sort((a, b) => a.connectedAt - b.connectedAt)[0];
  }

  getNewestConnection(): WebSocketConnection | undefined {
    return [...this.connections.values()].sort((a, b) => b.connectedAt - a.connectedAt)[0];
  }

  getAverageConnectionTime(): number {
    if (this.connections.size === 0) return 0;
    const now = Date.now();
    return [...this.connections.values()].reduce((sum, c) => sum + (now - c.connectedAt), 0) / this.connections.size;
  }

  getTotalConnections(): number {
    return this.stats.totalConnections;
  }

  getTotalMessages(): number {
    return this.stats.totalMessages;
  }

  getTotalBroadcasts(): number {
    return this.stats.totalBroadcasts;
  }

  getTotalErrors(): number {
    return this.stats.errors;
  }

  getErrorRate(): number {
    if (this.stats.totalMessages === 0) return 0;
    return this.stats.errors / this.stats.totalMessages;
  }

  getRoomList(): Array<{ name: string; memberCount: number; createdAt: number }> {
    return [...this.rooms.values()].map((room) => ({
      name: room.name,
      memberCount: room.members.size,
      createdAt: room.createdAt,
    }));
  }

  getConnectionList(): Array<{ id: string; userId?: string; rooms: string[]; connectedAt: number; isAlive: boolean }> {
    return [...this.connections.values()].map((conn) => ({
      id: conn.id,
      userId: conn.userId,
      rooms: [...conn.rooms],
      connectedAt: conn.connectedAt,
      isAlive: conn.isAlive,
    }));
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }

  toJSONDetailed(): string {
    return JSON.stringify({
      stats: this.getStats(),
      connections: this.getConnectionList(),
      rooms: this.getRoomList(),
    }, null, 2);
  }

  setMaxConnections(max: number): void {
    this.options.maxConnections = max;
  }

  setMaxRooms(max: number): void {
    this.options.maxRooms = max;
  }

  setMaxRoomSize(max: number): void {
    this.options.maxRoomSize = max;
  }

  setPingInterval(interval: number): void {
    this.options.pingInterval = interval;
    this.stopPingCheck();
    this.startPingCheck();
  }

  setPingTimeout(timeout: number): void {
    this.options.pingTimeout = timeout;
  }

  getOptions(): Required<ConnectionManagerOptions> {
    return { ...this.options };
  }

  cleanup(): number {
    let removed = 0;
    for (const [id, connection] of this.connections) {
      if (!connection.isAlive) {
        this.removeConnection(id);
        removed++;
      }
    }
    for (const [name, room] of this.rooms) {
      if (room.members.size === 0) {
        this.rooms.delete(name);
      }
    }
    return removed;
  }

  pruneEmptyRooms(): number {
    let removed = 0;
    for (const [name, room] of this.rooms) {
      if (room.members.size === 0) {
        this.rooms.delete(name);
        removed++;
      }
    }
    return removed;
  }

  pruneDeadConnections(): number {
    let removed = 0;
    for (const [id, connection] of this.connections) {
      if (!connection.isAlive) {
        this.removeConnection(id);
        removed++;
      }
    }
    return removed;
  }

  pruneAll(): { connections: number; rooms: number } {
    return {
      connections: this.pruneDeadConnections(),
      rooms: this.pruneEmptyRooms(),
    };
  }
}

export function createConnectionManager(options?: ConnectionManagerOptions): WebSocketConnectionManager {
  return new WebSocketConnectionManager(options);
}

export class WebSocketServer {
  private manager: WebSocketConnectionManager;
  private isRunning: boolean = false;
  private connectionCounter: number = 0;

  constructor(options?: ConnectionManagerOptions) {
    this.manager = new WebSocketConnectionManager(options);
  }

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
    this.manager.shutdown();
  }

  isRunningCheck(): boolean {
    return this.isRunning;
  }

  handleConnection(socket: WebSocket, metadata?: Record<string, unknown>): string {
    const id = `conn_${++this.connectionCounter}`;
    this.manager.addConnection(id, socket, metadata);
    socket.addEventListener("message", (event) => {
      const connection = this.manager.getConnection(id);
      if (connection) {
        this.manager.handleMessage(connection, event.data as string);
      }
    });
    socket.addEventListener("close", () => {
      this.manager.removeConnection(id);
    });
    socket.addEventListener("error", () => {
      this.manager.removeConnection(id);
    });
    return id;
  }

  getManager(): WebSocketConnectionManager {
    return this.manager;
  }

  getStats(): ReturnType<WebSocketConnectionManager["getStats"]> {
    return this.manager.getStats();
  }
}

export function createWebSocketServer(options?: ConnectionManagerOptions): WebSocketServer {
  return new WebSocketServer(options);
}

export class SSEManager {
  private connections: Map<string, { response: Response; userId?: string; metadata: Record<string, unknown>; connectedAt: number }> = new Map();
  private connectionCounter: number = 0;

  addConnection(response: Response, metadata?: Record<string, unknown>): string {
    const id = `sse_${++this.connectionCounter}`;
    response.headers.set("Content-Type", "text/event-stream");
    response.headers.set("Cache-Control", "no-cache");
    response.headers.set("Connection", "keep-alive");
    response.headers.set("X-Accel-Buffering", "no");
    this.connections.set(id, {
      response,
      metadata: metadata ?? {},
      connectedAt: Date.now(),
    });
    return id;
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
  }

  send(id: string, event: string, data: unknown): boolean {
    const connection = this.connections.get(id);
    if (!connection) return false;
    try {
      (connection.response as any).body = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      return true;
    } catch {
      this.removeConnection(id);
      return false;
    }
  }

  broadcast(event: string, data: unknown, excludeId?: string): number {
    let sent = 0;
    for (const [id] of this.connections) {
      if (id !== excludeId) {
        if (this.send(id, event, data)) {
          sent++;
        }
      }
    }
    return sent;
  }

  sendToUser(userId: string, event: string, data: unknown): number {
    let sent = 0;
    for (const [id, connection] of this.connections) {
      if (connection.userId === userId) {
        if (this.send(id, event, data)) {
          sent++;
        }
      }
    }
    return sent;
  }

  setUserId(id: string, userId: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.userId = userId;
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnection(id: string): { response: Response; userId?: string; metadata: Record<string, unknown>; connectedAt: number } | undefined {
    return this.connections.get(id);
  }

  getConnections(): Array<{ id: string; userId?: string; connectedAt: number }> {
    return [...this.connections.entries()].map(([id, conn]) => ({
      id,
      userId: conn.userId,
      connectedAt: conn.connectedAt,
    }));
  }

  close(id: string): void {
    this.removeConnection(id);
  }

  closeAll(): void {
    this.connections.clear();
  }

  sendHeartbeat(): number {
    return this.broadcast("heartbeat", { timestamp: Date.now() });
  }

  getStats(): { totalConnections: number; connections: Array<{ id: string; userId?: string; connectedAt: number }> } {
    return {
      totalConnections: this.connections.size,
      connections: this.getConnections(),
    };
  }
}

export function createSSEManager(): SSEManager {
  return new SSEManager();
}

export class FileUploadManager {
  private uploads: Map<string, { filename: string; size: number; received: number; chunks: Buffer[]; metadata: Record<string, unknown>; startedAt: number }> = new Map();
  private maxFileSize: number;
  private maxChunkSize: number;
  private allowedTypes: Set<string>;

  constructor(options: { maxFileSize?: number; maxChunkSize?: number; allowedTypes?: string[] } = {}) {
    this.maxFileSize = options.maxFileSize ?? 100 * 1024 * 1024;
    this.maxChunkSize = options.maxChunkSize ?? 5 * 1024 * 1024;
    this.allowedTypes = new Set(options.allowedTypes ?? ["*"]);
  }

  startUpload(uploadId: string, filename: string, size: number, metadata?: Record<string, unknown>): boolean {
    if (size > this.maxFileSize) return false;
    if (this.uploads.has(uploadId)) return false;
    this.uploads.set(uploadId, {
      filename,
      size,
      received: 0,
      chunks: [],
      metadata: metadata ?? {},
      startedAt: Date.now(),
    });
    return true;
  }

  addChunk(uploadId: string, chunk: Buffer): boolean {
    const upload = this.uploads.get(uploadId);
    if (!upload) return false;
    if (chunk.length > this.maxChunkSize) return false;
    upload.chunks.push(chunk);
    upload.received += chunk.length;
    if (upload.received > upload.size) {
      this.cancelUpload(uploadId);
      return false;
    }
    return true;
  }

  completeUpload(uploadId: string): Buffer | null {
    const upload = this.uploads.get(uploadId);
    if (!upload) return null;
    if (upload.received !== upload.size) return null;
    const data = Buffer.concat(upload.chunks);
    this.uploads.delete(uploadId);
    return data;
  }

  cancelUpload(uploadId: string): void {
    this.uploads.delete(uploadId);
  }

  getUploadProgress(uploadId: string): number {
    const upload = this.uploads.get(uploadId);
    if (!upload) return 0;
    return (upload.received / upload.size) * 100;
  }

  getUploadInfo(uploadId: string): { filename: string; size: number; received: number; progress: number; metadata: Record<string, unknown>; startedAt: number } | undefined {
    const upload = this.uploads.get(uploadId);
    if (!upload) return undefined;
    return {
      filename: upload.filename,
      size: upload.size,
      received: upload.received,
      progress: this.getUploadProgress(uploadId),
      metadata: upload.metadata,
      startedAt: upload.startedAt,
    };
  }

  getActiveUploads(): string[] {
    return [...this.uploads.keys()];
  }

  getActiveUploadCount(): number {
    return this.uploads.size;
  }

  isTypeAllowed(type: string): boolean {
    return this.allowedTypes.has("*") || this.allowedTypes.has(type);
  }

  setAllowedTypes(types: string[]): void {
    this.allowedTypes = new Set(types);
  }

  setMaxFileSize(size: number): void {
    this.maxFileSize = size;
  }

  setMaxChunkSize(size: number): void {
    this.maxChunkSize = size;
  }

  cleanup(ttl: number = 3600000): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, upload] of this.uploads) {
      if (now - upload.startedAt > ttl) {
        this.uploads.delete(id);
        removed++;
      }
    }
    return removed;
  }

  cancelAll(): void {
    this.uploads.clear();
  }

  getStats(): { activeUploads: number; totalReceived: number; averageProgress: number } {
    let totalReceived = 0;
    let totalSize = 0;
    for (const upload of this.uploads.values()) {
      totalReceived += upload.received;
      totalSize += upload.size;
    }
    return {
      activeUploads: this.uploads.size,
      totalReceived,
      averageProgress: totalSize > 0 ? (totalReceived / totalSize) * 100 : 0,
    };
  }
}

export function createFileUploadManager(options?: { maxFileSize?: number; maxChunkSize?: number; allowedTypes?: string[] }): FileUploadManager {
  return new FileUploadManager(options);
}

export class PollingManager {
  private polls: Map<string, { question: string; options: Array<{ id: string; text: string; votes: number }>; voters: Set<string>; createdAt: number; expiresAt?: number }> = new Map();

  createPoll(id: string, question: string, options: string[], expiresIn?: number): boolean {
    if (this.polls.has(id)) return false;
    this.polls.set(id, {
      question,
      options: options.map((text, i) => ({ id: `option_${i}`, text, votes: 0 })),
      voters: new Set(),
      createdAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn : undefined,
    });
    return true;
  }

  vote(pollId: string, optionId: string, voterId: string): boolean {
    const poll = this.polls.get(pollId);
    if (!poll) return false;
    if (poll.expiresAt && Date.now() > poll.expiresAt) return false;
    if (poll.voters.has(voterId)) return false;
    const option = poll.options.find((o) => o.id === optionId);
    if (!option) return false;
    option.votes++;
    poll.voters.add(voterId);
    return true;
  }

  getPoll(id: string): { question: string; options: Array<{ id: string; text: string; votes: number }>; totalVotes: number; createdAt: number; expiresAt?: number } | undefined {
    const poll = this.polls.get(id);
    if (!poll) return undefined;
    let totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
    return {
      question: poll.question,
      options: [...poll.options],
      totalVotes,
      createdAt: poll.createdAt,
      expiresAt: poll.expiresAt,
    };
  }

  getPollResults(id: string): Array<{ id: string; text: string; votes: number; percentage: number }> | undefined {
    const poll = this.polls.get(id);
    if (!poll) return undefined;
    const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
    return poll.options.map((o) => ({
      ...o,
      percentage: totalVotes > 0 ? (o.votes / totalVotes) * 100 : 0,
    }));
  }

  removePoll(id: string): void {
    this.polls.delete(id);
  }

  getActivePolls(): string[] {
    const now = Date.now();
    return [...this.polls.entries()].filter(([, poll]) => !poll.expiresAt || poll.expiresAt > now).map(([id]) => id);
  }

  getPollCount(): number {
    return this.polls.size;
  }

  getTotalVoters(id: string): number {
    return this.polls.get(id)?.voters.size ?? 0;
  }

  hasVoted(pollId: string, voterId: string): boolean {
    return this.polls.get(pollId)?.voters.has(voterId) ?? false;
  }

  closePoll(id: string): void {
    const poll = this.polls.get(id);
    if (poll) {
      poll.expiresAt = Date.now();
    }
  }

  isPollActive(id: string): boolean {
    const poll = this.polls.get(id);
    if (!poll) return false;
    if (poll.expiresAt && Date.now() > poll.expiresAt) return false;
    return true;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, poll] of this.polls) {
      if (poll.expiresAt && poll.expiresAt < now) {
        this.polls.delete(id);
        removed++;
      }
    }
    return removed;
  }

  closeAll(): void {
    for (const poll of this.polls.values()) {
      poll.expiresAt = Date.now();
    }
  }

  getStats(): { totalPolls: number; activePolls: number; totalVotes: number } {
    let totalVotes = 0;
    for (const poll of this.polls.values()) {
      totalVotes += poll.voters.size;
    }
    return {
      totalPolls: this.polls.size,
      activePolls: this.getActivePolls().length,
      totalVotes,
    };
  }
}

export function createPollingManager(): PollingManager {
  return new PollingManager();
}

export class PresenceManager {
  private presence: Map<string, { userId: string; status: "online" | "away" | "busy" | "offline"; lastSeen: number; metadata: Record<string, unknown> }> = new Map();
  private awayTimeout: number;
  private offlineTimeout: number;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(awayTimeout: number = 60000, offlineTimeout: number = 300000) {
    this.awayTimeout = awayTimeout;
    this.offlineTimeout = offlineTimeout;
  }

  setPresence(userId: string, status: "online" | "away" | "busy" | "offline", metadata?: Record<string, unknown>): void {
    this.presence.set(userId, {
      userId,
      status,
      lastSeen: Date.now(),
      metadata: metadata ?? {},
    });
  }

  updatePresence(userId: string): void {
    const presence = this.presence.get(userId);
    if (presence) {
      presence.lastSeen = Date.now();
      if (presence.status === "away" || presence.status === "offline") {
        presence.status = "online";
      }
    } else {
      this.setPresence(userId, "online");
    }
  }

  setAway(userId: string): void {
    const presence = this.presence.get(userId);
    if (presence) {
      presence.status = "away";
    }
  }

  setBusy(userId: string): void {
    const presence = this.presence.get(userId);
    if (presence) {
      presence.status = "busy";
    }
  }

  setOffline(userId: string): void {
    const presence = this.presence.get(userId);
    if (presence) {
      presence.status = "offline";
    }
  }

  getPresence(userId: string): { userId: string; status: string; lastSeen: number; metadata: Record<string, unknown> } | undefined {
    return this.presence.get(userId);
  }

  getStatus(userId: string): string | undefined {
    return this.presence.get(userId)?.status;
  }

  isOnline(userId: string): boolean {
    return this.presence.get(userId)?.status === "online";
  }

  isAway(userId: string): boolean {
    return this.presence.get(userId)?.status === "away";
  }

  isBusy(userId: string): boolean {
    return this.presence.get(userId)?.status === "busy";
  }

  isOffline(userId: string): boolean {
    const status = this.presence.get(userId)?.status;
    return status === "offline" || status === undefined;
  }

  getOnlineUsers(): string[] {
    return [...this.presence.entries()].filter(([, p]) => p.status === "online").map(([userId]) => userId);
  }

  getAwayUsers(): string[] {
    return [...this.presence.entries()].filter(([, p]) => p.status === "away").map(([userId]) => userId);
  }

  getBusyUsers(): string[] {
    return [...this.presence.entries()].filter(([, p]) => p.status === "busy").map(([userId]) => userId);
  }

  getOfflineUsers(): string[] {
    return [...this.presence.entries()].filter(([, p]) => p.status === "offline").map(([userId]) => userId);
  }

  getOnlineCount(): number {
    return this.getOnlineUsers().length;
  }

  getTotalUsers(): number {
    return this.presence.size;
  }

  startAutoCheck(): void {
    if (this.checkIntervalId) return;
    this.checkIntervalId = setInterval(() => this.checkStatuses(), 30000);
  }

  stopAutoCheck(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  private checkStatuses(): void {
    const now = Date.now();
    for (const [, presence] of this.presence) {
      const elapsed = now - presence.lastSeen;
      if (elapsed > this.offlineTimeout) {
        presence.status = "offline";
      } else if (elapsed > this.awayTimeout && presence.status === "online") {
        presence.status = "away";
      }
    }
  }

  removePresence(userId: string): void {
    this.presence.delete(userId);
  }

  clearAll(): void {
    this.presence.clear();
  }

  getStats(): { total: number; online: number; away: number; busy: number; offline: number } {
    return {
      total: this.presence.size,
      online: this.getOnlineCount(),
      away: this.getAwayUsers().length,
      busy: this.getBusyUsers().length,
      offline: this.getOfflineUsers().length,
    };
  }

  setMetadata(userId: string, key: string, value: unknown): void {
    const presence = this.presence.get(userId);
    if (presence) {
      presence.metadata[key] = value;
    }
  }

  getMetadata(userId: string, key: string): unknown {
    return this.presence.get(userId)?.metadata[key];
  }

  getAllMetadata(userId: string): Record<string, unknown> {
    return this.presence.get(userId)?.metadata ?? {};
  }

  setAwayTimeout(timeout: number): void {
    this.awayTimeout = timeout;
  }

  setOfflineTimeout(timeout: number): void {
    this.offlineTimeout = timeout;
  }

  getAwayTimeout(): number {
    return this.awayTimeout;
  }

  getOfflineTimeout(): number {
    return this.offlineTimeout;
  }

  getAllPresence(): Array<{ userId: string; status: string; lastSeen: number; metadata: Record<string, unknown> }> {
    return [...this.presence.values()];
  }

  getPresenceByStatus(status: "online" | "away" | "busy" | "offline"): Array<{ userId: string; status: string; lastSeen: number; metadata: Record<string, unknown> }> {
    return [...this.presence.values()].filter((p) => p.status === status);
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createPresenceManager(awayTimeout?: number, offlineTimeout?: number): PresenceManager {
  return new PresenceManager(awayTimeout, offlineTimeout);
}

export class NotificationManager {
  private notifications: Map<string, { id: string; userId: string; title: string; message: string; type: "info" | "warning" | "error" | "success"; read: boolean; createdAt: number; metadata: Record<string, unknown> }> = new Map();
  private notificationCounter: number = 0;

  send(userId: string, title: string, message: string, type: "info" | "warning" | "error" | "success" = "info", metadata?: Record<string, unknown>): string {
    const id = `notif_${++this.notificationCounter}`;
    this.notifications.set(id, {
      id,
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: Date.now(),
      metadata: metadata ?? {},
    });
    return id;
  }

  markAsRead(id: string): boolean {
    const notification = this.notifications.get(id);
    if (!notification) return false;
    notification.read = true;
    return true;
  }

  markAllAsRead(userId: string): number {
    let count = 0;
    for (const notification of this.notifications.values()) {
      if (notification.userId === userId && !notification.read) {
        notification.read = true;
        count++;
      }
    }
    return count;
  }

  deleteNotification(id: string): boolean {
    return this.notifications.delete(id);
  }

  getNotification(id: string): { id: string; userId: string; title: string; message: string; type: string; read: boolean; createdAt: number; metadata: Record<string, unknown> } | undefined {
    return this.notifications.get(id);
  }

  getUserNotifications(userId: string, unreadOnly: boolean = false): Array<{ id: string; userId: string; title: string; message: string; type: string; read: boolean; createdAt: number; metadata: Record<string, unknown> }> {
    return [...this.notifications.values()].filter((n) => n.userId === userId && (!unreadOnly || !n.read)).sort((a, b) => b.createdAt - a.createdAt);
  }

  getUnreadCount(userId: string): number {
    return [...this.notifications.values()].filter((n) => n.userId === userId && !n.read).length;
  }

  getTotalCount(userId: string): number {
    return [...this.notifications.values()].filter((n) => n.userId === userId).length;
  }

  clearUserNotifications(userId: string): number {
    let count = 0;
    for (const [id, notification] of this.notifications) {
      if (notification.userId === userId) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  clearAll(): void {
    this.notifications.clear();
  }

  cleanup(ttl: number = 604800000): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, notification] of this.notifications) {
      if (now - notification.createdAt > ttl) {
        this.notifications.delete(id);
        removed++;
      }
    }
    return removed;
  }

  getStats(): { total: number; unread: number; read: number } {
    let unread = 0;
    let read = 0;
    for (const notification of this.notifications.values()) {
      if (notification.read) read++;
      else unread++;
    }
    return { total: this.notifications.size, unread, read };
  }

  broadcast(title: string, message: string, type: "info" | "warning" | "error" | "success" = "info", metadata?: Record<string, unknown>): number {
    const userIds = new Set([...this.notifications.values()].map((n) => n.userId));
    let count = 0;
    for (const userId of userIds) {
      this.send(userId, title, message, type, metadata);
      count++;
    }
    return count;
  }

  sendToUsers(userIds: string[], title: string, message: string, type: "info" | "warning" | "error" | "success" = "info", metadata?: Record<string, unknown>): number {
    let count = 0;
    for (const userId of userIds) {
      this.send(userId, title, message, type, metadata);
      count++;
    }
    return count;
  }

  getNotificationTypes(): Record<string, number> {
    const types: Record<string, number> = {};
    for (const notification of this.notifications.values()) {
      types[notification.type] = (types[notification.type] ?? 0) + 1;
    }
    return types;
  }
}

export function createNotificationManager(): NotificationManager {
  return new NotificationManager();
}
