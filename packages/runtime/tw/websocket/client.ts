/**
 * WebSocket client -- reconnecting, heartbeat, message queue.
 * @module runtime/websocket
 */

export interface WebSocketClientOptions {
  url: string;
  protocols?: string | string[];
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  reconnectDecay?: number;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
  heartbeatMessage?: unknown;
  heartbeatTimeout?: number;
  messageQueue?: boolean;
  maxQueueSize?: number;
  binaryType?: BinaryType;
  debug?: boolean;
}

export interface WebSocketClientStats {
  connected: boolean;
  reconnectAttempts: number;
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  queueSize: number;
  uptime: number;
  lastConnectTime: number;
  lastDisconnectTime: number;
}

export type WebSocketClientState = "connecting" | "connected" | "disconnecting" | "disconnected" | "reconnecting";

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private options: Required<WebSocketClientOptions>;
  private state: WebSocketClientState = "disconnected";
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: Array<{ data: string | ArrayBufferLike | Blob | ArrayBufferView; timestamp: number }> = [];
  private connectTime: number = 0;
  private lastConnectTime: number = 0;
  private lastDisconnectTime: number = 0;
  private stats = { messagesSent: 0, messagesReceived: 0, bytesSent: 0, bytesReceived: 0 };
  private eventHandlers: Map<string, Set<(data?: unknown) => void>> = new Map();
  private messageHandlers: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(options: WebSocketClientOptions) {
    this.options = {
      url: options.url,
      protocols: options.protocols ?? [],
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      reconnectDecay: options.reconnectDecay ?? 1.5,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      heartbeatMessage: options.heartbeatMessage ?? { type: "ping" },
      heartbeatTimeout: options.heartbeatTimeout ?? 10000,
      messageQueue: options.messageQueue ?? true,
      maxQueueSize: options.maxQueueSize ?? 1000,
      binaryType: options.binaryType ?? "blob",
      debug: options.debug ?? false,
    };
  }

  connect(): void {
    if (this.state === "connected" || this.state === "connecting") return;
    this.setState("connecting");
    try {
      this.socket = new WebSocket(this.options.url, this.options.protocols.length > 0 ? this.options.protocols : undefined);
      this.socket.binaryType = this.options.binaryType;
      this.socket.onopen = () => this.onOpen();
      this.socket.onclose = (event) => this.onClose(event);
      this.socket.onerror = (event) => this.onError(event);
      this.socket.onmessage = (event) => this.handleMessage(event);
    } catch (error) {
      this.log(`Connection failed: ${error}`);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.setState("disconnecting");
    this.clearTimers();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close(1000, "Client disconnect");
      this.socket = null;
    }
    this.setState("disconnected");
    this.lastDisconnectTime = Date.now();
    this.emit("disconnect");
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
    if (this.state !== "connected" || !this.socket) {
      if (this.options.messageQueue) {
        this.enqueueMessage(data);
      }
      return false;
    }
    try {
      this.socket.send(data);
      this.stats.messagesSent++;
      this.stats.bytesSent += this.getDataSize(data);
      return true;
    } catch (error) {
      this.log(`Send failed: ${error}`);
      if (this.options.messageQueue) {
        this.enqueueMessage(data);
      }
      return false;
    }
  }

  sendJSON(data: unknown): boolean {
    return this.send(JSON.stringify(data));
  }

  private onOpen(): void {
    this.setState("connected");
    this.lastConnectTime = Date.now();
    this.connectTime = Date.now();
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.flushQueue();
    this.emit("connect");
    this.log("Connected");
  }

  private onClose(event: CloseEvent): void {
    this.setState("disconnected");
    this.lastDisconnectTime = Date.now();
    this.clearTimers();
    this.socket = null;
    this.emit("disconnect", event);
    this.log(`Disconnected: ${event.code} ${event.reason}`);
    if (this.options.reconnect && event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private onError(event: Event): void {
    this.emit("error", event);
    this.log(`Error: ${event}`);
  }

  private handleMessage(event: MessageEvent): void {
    this.stats.messagesReceived++;
    this.stats.bytesReceived += this.getDataSize(event.data);
    this.resetHeartbeatTimeout();
    let data: unknown = event.data;
    if (typeof event.data === "string") {
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }
    }
    if (data && typeof data === "object" && "type" in data) {
      const type = (data as { type: string }).type;
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.forEach((handler) => handler(data));
      }
    }
    this.emit("message", data);
  }

  on(event: string, handler: (data?: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  onMessage(type: string, handler: (data: unknown) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  off(event: string, handler?: (data?: unknown) => void): void {
    if (handler) {
      this.eventHandlers.get(event)?.delete(handler);
    } else {
      this.eventHandlers.delete(event);
    }
  }

  private emit(event: string, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data));
  }

  private startHeartbeat(): void {
    if (this.options.heartbeatInterval <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      this.send(JSON.stringify(this.options.heartbeatMessage));
      this.heartbeatTimeoutTimer = setTimeout(() => {
        this.log("Heartbeat timeout, reconnecting");
        this.socket?.close(4000, "Heartbeat timeout");
      }, this.options.heartbeatTimeout);
    }, this.options.heartbeatInterval);
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.log("Max reconnect attempts reached");
      this.emit("maxreconnect");
      return;
    }
    this.setState("reconnecting");
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(this.options.reconnectDecay, this.reconnectAttempts),
      this.options.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit("reconnect", { attempt: this.reconnectAttempts, delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private enqueueMessage(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      this.messageQueue.shift();
    }
    this.messageQueue.push({ data, timestamp: Date.now() });
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.state === "connected") {
      const message = this.messageQueue.shift()!;
      this.send(message.data);
    }
  }

  private getDataSize(data: unknown): number {
    if (typeof data === "string") return data.length;
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (data instanceof Blob) return data.size;
    if (ArrayBuffer.isView(data)) return data.byteLength;
    return 0;
  }

  private setState(state: WebSocketClientState): void {
    this.state = state;
    this.emit("statechange", state);
  }

  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[WebSocketClient] ${message}`);
    }
  }

  getState(): WebSocketClientState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === "connected";
  }

  isConnecting(): boolean {
    return this.state === "connecting" || this.state === "reconnecting";
  }

  isDisconnected(): boolean {
    return this.state === "disconnected";
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  clearQueue(): void {
    this.messageQueue = [];
  }

  getStats(): WebSocketClientStats {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      messagesSent: this.stats.messagesSent,
      messagesReceived: this.stats.messagesReceived,
      bytesSent: this.stats.bytesSent,
      bytesReceived: this.stats.bytesReceived,
      queueSize: this.messageQueue.length,
      uptime: this.isConnected() ? Date.now() - this.connectTime : 0,
      lastConnectTime: this.lastConnectTime,
      lastDisconnectTime: this.lastDisconnectTime,
    };
  }

  resetStats(): void {
    this.stats = { messagesSent: 0, messagesReceived: 0, bytesSent: 0, bytesReceived: 0 };
  }

  setOptions(options: Partial<WebSocketClientOptions>): void {
    this.options = { ...this.options, ...options } as Required<WebSocketClientOptions>;
  }

  getOptions(): Required<WebSocketClientOptions> {
    return { ...this.options };
  }

  getUrl(): string {
    return this.options.url;
  }

  setUrl(url: string): void {
    this.options.url = url;
  }

  setReconnect(enabled: boolean): void {
    this.options.reconnect = enabled;
  }

  isReconnectEnabled(): boolean {
    return this.options.reconnect;
  }

  setHeartbeatInterval(interval: number): void {
    this.options.heartbeatInterval = interval;
    if (this.isConnected()) {
      this.clearTimers();
      this.startHeartbeat();
    }
  }

  getHeartbeatInterval(): number {
    return this.options.heartbeatInterval;
  }

  setMessageQueue(enabled: boolean): void {
    this.options.messageQueue = enabled;
    if (!enabled) {
      this.clearQueue();
    }
  }

  isMessageQueueEnabled(): boolean {
    return this.options.messageQueue;
  }

  setMaxQueueSize(max: number): void {
    this.options.maxQueueSize = max;
    while (this.messageQueue.length > max) {
      this.messageQueue.shift();
    }
  }

  getMaxQueueSize(): number {
    return this.options.maxQueueSize;
  }

  setDebug(debug: boolean): void {
    this.options.debug = debug;
  }

  isDebugEnabled(): boolean {
    return this.options.debug;
  }

  destroy(): void {
    this.disconnect();
    this.eventHandlers.clear();
    this.messageHandlers.clear();
    this.clearQueue();
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createWebSocketClient(options: WebSocketClientOptions): WebSocketClient {
  return new WebSocketClient(options);
}

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private isRegistered: boolean = false;
  private updateAvailable: boolean = false;
  private eventHandlers: Map<string, Set<(data?: unknown) => void>> = new Map();

  constructor() {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        this.emit("controllerchange");
      });
      navigator.serviceWorker.addEventListener("message", (event) => {
        this.emit("message", event.data);
      });
    }
  }

  async register(scriptUrl: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Workers not supported");
      return null;
    }
    try {
      this.registration = await navigator.serviceWorker.register(scriptUrl, options);
      this.isRegistered = true;
      this.registration.addEventListener("updatefound", () => {
        this.updateAvailable = true;
        this.emit("updateavailable");
        const installingWorker = this.registration?.installing;
        if (installingWorker) {
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              this.emit("updatefound");
            } else if (installingWorker.state === "activated") {
              this.emit("activated");
            }
          });
        }
      });
      this.emit("registered", this.registration);
      return this.registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      this.emit("error", error);
      return null;
    }
  }

  async unregister(): Promise<boolean> {
    if (this.registration) {
      const result = await this.registration.unregister();
      this.registration = null;
      this.isRegistered = false;
      this.emit("unregistered");
      return result;
    }
    return false;
  }

  async update(): Promise<void> {
    if (this.registration) {
      await this.registration.update();
    }
  }

  async skipWaiting(): Promise<void> {
    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }

  isRegisteredCheck(): boolean {
    return this.isRegistered;
  }

  isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  isSupported(): boolean {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator;
  }

  getController(): ServiceWorker | null {
    return navigator.serviceWorker?.controller ?? null;
  }

  hasController(): boolean {
    return this.getController() !== null;
  }

  postMessage(message: unknown): void {
    if (this.registration?.active) {
      this.registration.active.postMessage(message);
    }
  }

  on(event: string, handler: (data?: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data));
  }

  async getNotifications(): Promise<Notification[]> {
    if (this.registration) {
      return this.registration.getNotifications();
    }
    return [];
  }

  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (this.registration) {
      await this.registration.showNotification(title, options);
    }
  }

  async getSubscription(): Promise<PushSubscription | null> {
    if (this.registration?.pushManager) {
      return this.registration.pushManager.getSubscription();
    }
    return null;
  }

  async subscribePush(options: PushSubscriptionOptions): Promise<PushSubscription | null> {
    if (this.registration?.pushManager) {
      return this.registration.pushManager.subscribe(options);
    }
    return null;
  }

  async unsubscribePush(): Promise<boolean> {
    const subscription = await this.getSubscription();
    if (subscription) {
      return subscription.unsubscribe();
    }
    return false;
  }

  async hasPushSubscription(): Promise<boolean> {
    const subscription = await this.getSubscription();
    return subscription !== null;
  }

  getScope(): string | undefined {
    return this.registration?.scope;
  }

  isControlling(): boolean {
    return this.hasController();
  }

  async waitForActive(): Promise<void> {
    if (this.registration?.active) return;
    return new Promise((resolve) => {
      if (this.registration?.installing) {
        this.registration.installing.addEventListener("statechange", () => {
          if (this.registration?.active) {
            resolve();
          }
        });
      } else if (this.registration?.waiting) {
        this.registration.waiting.addEventListener("statechange", () => {
          if (this.registration?.active) {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

export function createServiceWorkerManager(): ServiceWorkerManager {
  return new ServiceWorkerManager();
}

export class MediaRecorderManager {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private isRecording: boolean = false;
  private startTime: number = 0;
  private mimeType: string = "";
  private eventHandlers: Map<string, Set<(data?: unknown) => void>> = new Map();

  async start(options?: { audio?: boolean; video?: boolean; mimeType?: string; videoBitsPerSecond?: number; audioBitsPerSecond?: number }): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: options?.audio ?? true,
        video: options?.video ?? false,
      });
      this.chunks = [];
      this.mimeType = options?.mimeType ?? this.getSupportedMimeType();
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType,
        videoBitsPerSecond: options?.videoBitsPerSecond,
        audioBitsPerSecond: options?.audioBitsPerSecond,
      });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.onstop = () => {
        this.emit("stop", this.getBlob());
      };
      this.recorder.start();
      this.isRecording = true;
      this.startTime = Date.now();
      this.emit("start");
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  stop(): void {
    if (this.recorder && this.isRecording) {
      this.recorder.stop();
      this.isRecording = false;
      this.stream?.getTracks().forEach((track) => track.stop());
    }
  }

  pause(): void {
    if (this.recorder && this.isRecording) {
      this.recorder.pause();
      this.emit("pause");
    }
  }

  resume(): void {
    if (this.recorder) {
      this.recorder.resume();
      this.emit("resume");
    }
  }

  isRecordingCheck(): boolean {
    return this.isRecording;
  }

  getDuration(): number {
    if (this.isRecording) {
      return Date.now() - this.startTime;
    }
    return 0;
  }

  getBlob(): Blob {
    return new Blob(this.chunks, { type: this.mimeType });
  }

  getChunks(): BlobPart[] {
    return [...this.chunks];
  }

  clearChunks(): void {
    this.chunks = [];
  }

  getMimeType(): string {
    return this.mimeType;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getRecorder(): MediaRecorder | null {
    return this.recorder;
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.stream?.getAudioTracks() ?? [];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.stream?.getVideoTracks() ?? [];
  }

  isAudioEnabled(): boolean {
    return this.getAudioTracks().some((track) => track.enabled);
  }

  isVideoEnabled(): boolean {
    return this.getVideoTracks().some((track) => track.enabled);
  }

  toggleAudio(): void {
    this.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  }

  toggleVideo(): void {
    this.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
  }

  enableAudio(): void {
    this.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
  }

  disableAudio(): void {
    this.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  }

  enableVideo(): void {
    this.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
  }

  disableVideo(): void {
    this.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
  }

  private getSupportedMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }

  static getSupportedMimeTypes(): string[] {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return types.filter((type) => MediaRecorder.isTypeSupported(type));
  }

  static isSupported(): boolean {
    return typeof MediaRecorder !== "undefined";
  }

  download(filename: string = "recording"): void {
    const blob = this.getBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async toBase64(): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(this.getBlob());
    });
  }

  on(event: string, handler: (data?: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data));
  }

  destroy(): void {
    this.stop();
    this.clearChunks();
    this.eventHandlers.clear();
  }
}

export function createMediaRecorderManager(): MediaRecorderManager {
  return new MediaRecorderManager();
}

export class AudioContextManager {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private isPlaying: boolean = false;
  private volume: number = 1;
  private eventHandlers: Map<string, Set<(data?: unknown) => void>> = new Map();

  constructor() {
    if (typeof AudioContext !== "undefined") {
      this.context = new AudioContext();
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
      this.gainNode.gain.value = this.volume;
      this.analyser = this.context.createAnalyser();
      this.analyser.connect(this.gainNode);
    }
  }

  getContext(): AudioContext | null {
    return this.context;
  }

  getGainNode(): GainNode | null {
    return this.gainNode;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  async resume(): Promise<void> {
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.context?.state === "running") {
      await this.context.suspend();
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  getState(): AudioContextState | null {
    return this.context?.state ?? null;
  }

  isRunning(): boolean {
    return this.context?.state === "running";
  }

  isSuspended(): boolean {
    return this.context?.state === "suspended";
  }

  isClosed(): boolean {
    return this.context?.state === "closed" || this.context === null;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.context) {
      this.gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  mute(): void {
    if (this.gainNode && this.context) {
      this.gainNode.gain.setValueAtTime(0, this.context.currentTime);
    }
  }

  unmute(): void {
    if (this.gainNode && this.context) {
      this.gainNode.gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  isMuted(): boolean {
    return this.gainNode?.gain.value === 0;
  }

  async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> {
    if (!this.context) return null;
    return this.context.decodeAudioData(arrayBuffer);
  }

  async loadAudio(url: string): Promise<AudioBuffer | null> {
    if (!this.context) return null;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return this.decodeAudioData(arrayBuffer);
    } catch (error) {
      this.emit("error", error);
      return null;
    }
  }

  playBuffer(buffer: AudioBuffer, loop: boolean = false): void {
    if (!this.context || !this.analyser) return;
    this.stop();
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = loop;
    this.source.connect(this.analyser);
    this.source.onended = () => {
      this.isPlaying = false;
      this.emit("ended");
    };
    this.source.start();
    this.isPlaying = true;
    this.emit("play");
  }

  playOscillator(frequency: number, type: OscillatorType = "sine", duration?: number): void {
    if (!this.context || !this.analyser) return;
    this.stopOscillator();
    this.oscillator = this.context.createOscillator();
    this.oscillator.type = type;
    this.oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    this.oscillator.connect(this.analyser);
    this.oscillator.start();
    if (duration) {
      this.oscillator.stop(this.context.currentTime + duration);
    }
    this.emit("oscillatorstart");
  }

  stopOscillator(): void {
    if (this.oscillator) {
      try {
        this.oscillator.stop();
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
      this.oscillator.disconnect();
      this.oscillator = null;
    }
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    this.stopOscillator();
    this.emit("stop");
  }

  isPlayingCheck(): boolean {
    return this.isPlaying;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getTimeDomainData(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  getSampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  getCurrentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  getBaseLatency(): number {
    return this.context?.baseLatency ?? 0;
  }

  getOutputLatency(): number {
    return (this.context as AudioContext & { outputLatency?: number })?.outputLatency ?? 0;
  }

  createOscillator(type: OscillatorType = "sine", frequency: number = 440): OscillatorNode | null {
    if (!this.context) return null;
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    return osc;
  }

  createGain(): GainNode | null {
    if (!this.context) return null;
    return this.context.createGain();
  }

  createBiquadFilter(type: BiquadFilterType = "lowpass", frequency: number = 1000): BiquadFilterNode | null {
    if (!this.context) return null;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    return filter;
  }

  createDynamicsCompressor(): DynamicsCompressorNode | null {
    if (!this.context) return null;
    return this.context.createDynamicsCompressor();
  }

  createConvolver(): ConvolverNode | null {
    if (!this.context) return null;
    return this.context.createConvolver();
  }

  createWaveShaper(): WaveShaperNode | null {
    if (!this.context) return null;
    return this.context.createWaveShaper();
  }

  createPanner(): StereoPannerNode | null {
    if (!this.context) return null;
    return this.context.createStereoPanner();
  }

  createDelay(maxDelayTime: number = 1): DelayNode | null {
    if (!this.context) return null;
    return this.context.createDelay(maxDelayTime);
  }

  createReverb(): ConvolverNode | null {
    return this.createConvolver();
  }

  addFilter(type: BiquadFilterType, frequency: number): BiquadFilterNode | null {
    const filter = this.createBiquadFilter(type, frequency);
    if (filter) {
      this.filters.push(filter);
    }
    return filter;
  }

  removeFilter(filter: BiquadFilterNode): void {
    const index = this.filters.indexOf(filter);
    if (index !== -1) {
      filter.disconnect();
      this.filters.splice(index, 1);
    }
  }

  clearFilters(): void {
    this.filters.forEach((filter) => filter.disconnect());
    this.filters = [];
  }

  getFilterCount(): number {
    return this.filters.length;
  }

  getFilters(): BiquadFilterNode[] {
    return [...this.filters];
  }

  on(event: string, handler: (data?: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data));
  }

  static isSupported(): boolean {
    return typeof AudioContext !== "undefined";
  }

  destroy(): void {
    this.stop();
    this.clearFilters();
    this.close();
    this.eventHandlers.clear();
  }
}

export function createAudioContextManager(): AudioContextManager {
  return new AudioContextManager();
}
