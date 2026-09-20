/**
 * Web Worker pool manager -- manages worker lifecycle and task distribution.
 * @module runtime/web-workers
 */

export interface WorkerTask {
  id: string;
  type: string;
  data: unknown;
  transfer?: Transferable[];
  priority: number;
  timeout?: number;
  retries: number;
  createdAt: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface WorkerPoolOptions {
  minWorkers?: number;
  maxWorkers?: number;
  workerScript?: string;
  idleTimeout?: number;
  taskTimeout?: number;
  maxRetries?: number;
  priorityLevels?: number;
}

export interface WorkerStats {
  totalWorkers: number;
  idleWorkers: number;
  busyWorkers: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskTime: number;
}

export class WorkerWrapper {
  public id: string;
  public worker: Worker;
  public busy: boolean = false;
  public currentTask: WorkerTask | null = null;
  public lastUsed: number = Date.now();
  public tasksCompleted: number = 0;
  public totalTaskTime: number = 0;
  private messageHandler: ((task: WorkerTask, data: unknown) => void) | null = null;
  private errorHandler: ((task: WorkerTask, error: Error) => void) | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(worker: Worker) {
    this.id = `worker_${Math.random().toString(36).slice(2, 10)}`;
    this.worker = worker;
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onError);
  }

  private onMessage = (event: MessageEvent): void => {
    if (!this.currentTask) return;
    const task = this.currentTask;
    this.clearTimeout();
    this.busy = false;
    this.currentTask = null;
    this.tasksCompleted++;
    this.lastUsed = Date.now();
    this.messageHandler?.(task, event.data);
  };

  private onError = (event: ErrorEvent): void => {
    if (!this.currentTask) return;
    const task = this.currentTask;
    this.clearTimeout();
    this.busy = false;
    this.currentTask = null;
    this.errorHandler?.(task, new Error(event.message));
  };

  run(task: WorkerTask, onMessage: (task: WorkerTask, data: unknown) => void, onError: (task: WorkerTask, error: Error) => void, timeout?: number): void {
    this.busy = true;
    this.currentTask = task;
    this.messageHandler = onMessage;
    this.errorHandler = onError;
    this.lastUsed = Date.now();
    if (timeout && timeout > 0) {
      this.timeoutId = setTimeout(() => {
        if (this.currentTask) {
          this.busy = false;
          this.currentTask = null;
          onError(task, new Error(`Task timeout after ${timeout}ms`));
        }
      }, timeout);
    }
    const transfer = task.transfer ?? [];
    this.worker.postMessage({ type: task.type, data: task.data }, transfer);
  }

  clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  terminate(): void {
    this.clearTimeout();
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.terminate();
  }

  isIdle(): boolean {
    return !this.busy;
  }

  isBusy(): boolean {
    return this.busy;
  }

  getIdleTime(): number {
    return Date.now() - this.lastUsed;
  }

  getAverageTaskTime(): number {
    return this.tasksCompleted > 0 ? this.totalTaskTime / this.tasksCompleted : 0;
  }
}

export class WorkerPool {
  private workers: WorkerWrapper[] = [];
  private taskQueue: WorkerTask[] = [];
  private options: Required<WorkerPoolOptions>;
  private stats = { completedTasks: 0, failedTasks: 0, totalTime: 0 };
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown: boolean = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.options = {
      minWorkers: options.minWorkers ?? 1,
      maxWorkers: options.maxWorkers ?? navigator.hardwareConcurrency ?? 4,
      workerScript: options.workerScript ?? "",
      idleTimeout: options.idleTimeout ?? 30000,
      taskTimeout: options.taskTimeout ?? 30000,
      maxRetries: options.maxRetries ?? 1,
      priorityLevels: options.priorityLevels ?? 3,
    };
    this.initWorkers();
    this.startIdleCheck();
  }

  private initWorkers(): void {
    for (let i = 0; i < this.options.minWorkers; i++) {
      this.createWorker();
    }
  }

  private createWorker(): WorkerWrapper | null {
    if (!this.options.workerScript) return null;
    try {
      const worker = new Worker(this.options.workerScript);
      const wrapper = new WorkerWrapper(worker);
      this.workers.push(wrapper);
      return wrapper;
    } catch (error) {
      console.error("Failed to create worker:", error);
      return null;
    }
  }

  private startIdleCheck(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleWorkers();
    }, 10000);
  }

  private checkIdleWorkers(): void {
    if (this.isShuttingDown) return;
    const now = Date.now();
    for (let i = this.workers.length - 1; i >= 0; i--) {
      const worker = this.workers[i];
      if (worker.isIdle() && worker.getIdleTime() > this.options.idleTimeout && this.workers.length > this.options.minWorkers) {
        worker.terminate();
        this.workers.splice(i, 1);
      }
    }
  }

  async execute(type: string, data: unknown, options: { priority?: number; timeout?: number; transfer?: Transferable[]; retries?: number } = {}): Promise<unknown> {
    const { priority = 1, timeout = this.options.taskTimeout, transfer = [], retries = this.options.maxRetries } = options;
    return new Promise((resolve, reject) => {
      const task: WorkerTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        data,
        transfer,
        priority,
        timeout,
        retries,
        createdAt: Date.now(),
        resolve,
        reject,
      };
      this.enqueueTask(task);
      this.processQueue();
    });
  }

  private enqueueTask(task: WorkerTask): void {
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });
  }

  private processQueue(): void {
    if (this.isShuttingDown) return;
    while (this.taskQueue.length > 0) {
      const idleWorker = this.getIdleWorker();
      if (!idleWorker) {
        if (this.workers.length < this.options.maxWorkers) {
          const newWorker = this.createWorker();
          if (newWorker) {
            this.assignTask(newWorker);
          }
        }
        break;
      }
      this.assignTask(idleWorker);
    }
  }

  private assignTask(worker: WorkerWrapper): void {
    const task = this.taskQueue.shift();
    if (!task) return;
    const startTime = Date.now();
    worker.run(
      task,
      (completedTask, data) => {
        const duration = Date.now() - startTime;
        worker.totalTaskTime += duration;
        this.stats.completedTasks++;
        this.stats.totalTime += duration;
        completedTask.resolve(data);
        this.processQueue();
      },
      (failedTask, error) => {
        if (failedTask.retries > 0) {
          failedTask.retries--;
          this.enqueueTask(failedTask);
        } else {
          this.stats.failedTasks++;
          failedTask.reject(error);
        }
        this.processQueue();
      },
      task.timeout,
    );
  }

  private getIdleWorker(): WorkerWrapper | null {
    return this.workers.find((w) => w.isIdle()) ?? null;
  }

  getIdleWorkerCount(): number {
    return this.workers.filter((w) => w.isIdle()).length;
  }

  getBusyWorkerCount(): number {
    return this.workers.filter((w) => w.isBusy()).length;
  }

  getPendingTaskCount(): number {
    return this.taskQueue.length;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  getStats(): WorkerStats {
    return {
      totalWorkers: this.workers.length,
      idleWorkers: this.getIdleWorkerCount(),
      busyWorkers: this.getBusyWorkerCount(),
      pendingTasks: this.taskQueue.length,
      completedTasks: this.stats.completedTasks,
      failedTasks: this.stats.failedTasks,
      averageTaskTime: this.stats.completedTasks > 0 ? this.stats.totalTime / this.stats.completedTasks : 0,
    };
  }

  terminate(): void {
    this.isShuttingDown = true;
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    for (const task of this.taskQueue) {
      task.reject(new Error("Worker pool terminated"));
    }
    this.taskQueue = [];
  }

  drain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.taskQueue.length === 0 && this.getBusyWorkerCount() === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  pause(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  resume(): void {
    if (!this.idleCheckInterval) {
      this.startIdleCheck();
    }
    this.processQueue();
  }

  setMaxWorkers(max: number): void {
    this.options.maxWorkers = max;
  }

  setMinWorkers(min: number): void {
    this.options.minWorkers = min;
  }

  getOptions(): Required<WorkerPoolOptions> {
    return { ...this.options };
  }
}

export function createWorkerPool(options?: WorkerPoolOptions): WorkerPool {
  return new WorkerPool(options);
}

export class SimpleWorker {
  private worker: Worker | null = null;
  private script: string;
  private messageHandlers: Map<string, Array<(data: unknown) => void>> = new Map();
  private errorHandler: ((error: Error) => void) | null = null;

  constructor(script: string) {
    this.script = script;
  }

  async init(): Promise<void> {
    const blob = new Blob([this.script], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this.worker = new Worker(url);
    this.worker.addEventListener("message", (event) => {
      const { type, data } = event.data;
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.forEach((handler) => handler(data));
      }
    });
    this.worker.addEventListener("error", (event) => {
      this.errorHandler?.(new Error(event.message));
    });
    URL.revokeObjectURL(url);
  }

  on(type: string, handler: (data: unknown) => void): () => void {
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

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  send(type: string, data: unknown, transfer?: Transferable[]): void {
    this.worker?.postMessage({ type, data }, transfer ?? []);
  }

  async request(type: string, data: unknown, timeout: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout: ${type}`));
      }, timeout);
      const handler = (response: unknown) => {
        clearTimeout(timer);
        resolve(response);
      };
      const unsubscribe = this.on(`${type}:response`, handler);
      this.send(type, data);
      setTimeout(() => unsubscribe(), timeout);
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.messageHandlers.clear();
  }
}

export function createSimpleWorker(script: string): SimpleWorker {
  return new SimpleWorker(script);
}

export class SharedWorkerManager {
  private workers: Map<string, SharedWorker> = new Map();

  create(name: string, script: string): SharedWorker {
    const worker = new SharedWorker(script, name);
    this.workers.set(name, worker);
    return worker;
  }

  get(name: string): SharedWorker | undefined {
    return this.workers.get(name);
  }

  terminate(name: string): void {
    const worker = this.workers.get(name);
    if (worker) {
      worker.port.close();
      this.workers.delete(name);
    }
  }

  terminateAll(): void {
    for (const [, worker] of this.workers) {
      worker.port.close();
    }
    this.workers.clear();
  }

  list(): string[] {
    return [...this.workers.keys()];
  }

  size(): number {
    return this.workers.size;
  }
}

export function createSharedWorkerManager(): SharedWorkerManager {
  return new SharedWorkerManager();
}

export class WorkerTaskQueue {
  private queue: WorkerTask[] = [];
  private processing: boolean = false;
  private concurrency: number;
  private executing: Set<WorkerTask> = new Set();
  private onComplete?: () => void;

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  enqueue(task: WorkerTask): this {
    this.queue.push(task);
    this.process();
    return this;
  }

  enqueueAll(tasks: WorkerTask[]): this {
    this.queue.push(...tasks);
    this.process();
    return this;
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0 && this.executing.size < this.concurrency) {
      const task = this.queue.shift()!;
      this.executing.add(task);
      try {
        await this.executeTask(task);
      } catch (error) {
        task.reject(error as Error);
      } finally {
        this.executing.delete(task);
      }
    }
    this.processing = false;
    if (this.queue.length === 0 && this.executing.size === 0) {
      this.onComplete?.();
    }
  }

  private async executeTask(task: WorkerTask): Promise<void> {
    return new Promise((resolve) => {
      task.resolve(undefined);
      resolve();
    });
  }

  drain(): Promise<void> {
    return new Promise((resolve) => {
      if (this.queue.length === 0 && this.executing.size === 0) {
        resolve();
        return;
      }
      this.onComplete = resolve;
    });
  }

  size(): number {
    return this.queue.length;
  }

  executingCount(): number {
    return this.executing.size;
  }

  clear(): void {
    this.queue = [];
  }
}

export function createWorkerTaskQueue(concurrency: number = 1): WorkerTaskQueue {
  return new WorkerTaskQueue(concurrency);
}

export class WorkerMessageBus {
  private channels: Map<string, Set<(data: unknown) => void>> = new Map();
  private worker: Worker | null = null;

  constructor(worker?: Worker) {
    if (worker) {
      this.attach(worker);
    }
  }

  attach(worker: Worker): void {
    this.worker = worker;
    worker.addEventListener("message", (event) => {
      const { channel, data } = event.data;
      this.publish(channel, data);
    });
  }

  subscribe(channel: string, handler: (data: unknown) => void): () => void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(handler);
    return () => {
      this.channels.get(channel)?.delete(handler);
    };
  }

  publish(channel: string, data: unknown): void {
    const handlers = this.channels.get(channel);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  send(channel: string, data: unknown, transfer?: Transferable[]): void {
    this.worker?.postMessage({ channel, data }, transfer ?? []);
  }

  async request(channel: string, data: unknown, timeout: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Bus request timeout: ${channel}`));
      }, timeout);
      const unsubscribe = this.subscribe(`${channel}:response`, (response) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(response);
      });
      this.send(channel, data);
    });
  }

  broadcast(channel: string, data: unknown): void {
    this.publish(channel, data);
  }

  unsubscribeAll(channel: string): void {
    this.channels.delete(channel);
  }

  clear(): void {
    this.channels.clear();
  }

  getChannels(): string[] {
    return [...this.channels.keys()];
  }

  getSubscriberCount(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }
}

export function createWorkerMessageBus(worker?: Worker): WorkerMessageBus {
  return new WorkerMessageBus(worker);
}

export class WorkerHealthMonitor {
  private workers: Map<string, { worker: WorkerWrapper; health: { isAlive: boolean; lastHeartbeat: number; heartbeatCount: number; failures: number } }> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: number;
  private maxFailures: number;

  constructor(heartbeatInterval: number = 5000, maxFailures: number = 3) {
    this.heartbeatInterval = heartbeatInterval;
    this.maxFailures = maxFailures;
  }

  register(id: string, worker: WorkerWrapper): void {
    this.workers.set(id, { worker, health: { isAlive: true, lastHeartbeat: Date.now(), heartbeatCount: 0, failures: 0 } });
  }

  unregister(id: string): void {
    this.workers.delete(id);
  }

  heartbeat(id: string): void {
    const entry = this.workers.get(id);
    if (entry) {
      entry.health.lastHeartbeat = Date.now();
      entry.health.heartbeatCount++;
      entry.health.failures = 0;
      entry.health.isAlive = true;
    }
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.check(), this.heartbeatInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private check(): void {
    const now = Date.now();
    for (const [id, entry] of this.workers) {
      if (now - entry.health.lastHeartbeat > this.heartbeatInterval * 2) {
        entry.health.failures++;
        entry.health.isAlive = false;
        if (entry.health.failures >= this.maxFailures) {
          entry.worker.terminate();
          this.workers.delete(id);
        }
      }
    }
  }

  isAlive(id: string): boolean {
    return this.workers.get(id)?.health.isAlive ?? false;
  }

  getHealth(id: string): { isAlive: boolean; lastHeartbeat: number; heartbeatCount: number; failures: number } | undefined {
    return this.workers.get(id)?.health;
  }

  getAllHealth(): Map<string, { isAlive: boolean; lastHeartbeat: number; heartbeatCount: number; failures: number }> {
    const result = new Map();
    for (const [id, entry] of this.workers) {
      result.set(id, entry.health);
    }
    return result;
  }

  getAliveCount(): number {
    let count = 0;
    for (const entry of this.workers.values()) {
      if (entry.health.isAlive) count++;
    }
    return count;
  }

  getDeadCount(): number {
    let count = 0;
    for (const entry of this.workers.values()) {
      if (!entry.health.isAlive) count++;
    }
    return count;
  }
}

export function createWorkerHealthMonitor(heartbeatInterval?: number, maxFailures?: number): WorkerHealthMonitor {
  return new WorkerHealthMonitor(heartbeatInterval, maxFailures);
}
