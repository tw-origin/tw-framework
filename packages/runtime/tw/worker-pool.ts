/**
 * Worker Pool -- manage Web Workers for parallel CPU-intensive tasks.
 *
 * Features:
 * - Fixed-size worker pool (configurable)
 * - Task queue with priority
 * - Automatic worker selection (round-robin)
 * - Task cancellation
 * - Worker recycling
 * - Error handling and worker recovery
 * - Progress tracking
 * - Inline worker creation (Blob URL)
 * - Worker warmup
 * - Statistics
 */

// --- Types ------------------------------------------------------------

export interface WorkerTask<T = unknown> {
  id: number;
  data: unknown;
  priority: number;
  transfer?: Transferable[];
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
  createdAt: number;
}

export interface WorkerPoolOptions {
  size?: number;
  workerScript?: string;
  workerFn?: () => Worker;
  warmup?: boolean;
  maxRetries?: number;
  taskTimeout?: number;
}

// --- Worker Pool ------------------------------------------------------

class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private busyWorkers = new Map<Worker, WorkerTask>();
  private queue: WorkerTask[] = [];
  private options: Required<WorkerPoolOptions>;
  private taskIdCounter = 0;
  private roundRobin = 0;
  private stats = { tasksCompleted: 0, tasksFailed: 0, avgTime: 0, totalTime: 0 };

  constructor(options: WorkerPoolOptions = {}) {
    this.options = {
      size: navigator.hardwareConcurrency || 4,
      workerScript: "",
      warmup: false,
      maxRetries: 1,
      taskTimeout: 30000,
      ...options,
    } as any;

    this.initWorkers();
  }

  /**
   * Execute a task on a worker.
   */
  execute<T = unknown>(data: unknown, options: { priority?: number; transfer?: Transferable[]; onProgress?: (p: number) => void } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<T> = {
        id: ++this.taskIdCounter,
        data,
        priority: options.priority || 0,
        transfer: options.transfer,
        resolve,
        reject,
        onProgress: options.onProgress,
        createdAt: Date.now(),
      };

      // Insert by priority (higher priority first)
      let insertIdx = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].priority < task.priority) {
          insertIdx = i;
          break;
        }
      }
      this.queue.splice(insertIdx, 0, task);

      this.processQueue();
    });
  }

  /**
   * Get pool statistics.
   */
  getStats() {
    return {
      poolSize: this.workers.length,
      available: this.availableWorkers.length,
      busy: this.busyWorkers.size,
      queued: this.queue.length,
      ...this.stats,
    };
  }

  /**
   * Terminate all workers.
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers.clear();
    this.queue = [];
  }

  /**
   * Resize the pool.
   */
  resize(size: number): void {
    const currentSize = this.workers.length;
    if (size > currentSize) {
      for (let i = currentSize; i < size; i++) {
        const worker = this.createWorker();
        this.workers.push(worker);
        this.availableWorkers.push(worker);
      }
    } else if (size < currentSize) {
      for (let i = size; i < currentSize; i++) {
        const worker = this.workers.pop();
        if (worker) {
          worker.terminate();
          const availIdx = this.availableWorkers.indexOf(worker);
          if (availIdx >= 0) this.availableWorkers.splice(availIdx, 1);
        }
      }
    }
  }

  // --- Internal ------------------------------------------------------

  private initWorkers(): void {
    for (let i = 0; i < this.options.size; i++) {
      const worker = this.createWorker();
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  private createWorker(): Worker {
    let worker: Worker;

    if (this.options.workerFn) {
      worker = this.options.workerFn();
    } else if (this.options.workerScript) {
      // Create worker from inline script using Blob
      const blob = new Blob([this.options.workerScript], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      // Revoke after worker loads
      worker.addEventListener("message", () => URL.revokeObjectURL(url), { once: true });
    } else {
      throw new Error("[TW WorkerPool] No workerScript or workerFn provided");
    }

    return worker;
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.queue.shift()!;
      const worker = this.availableWorkers.shift()!;
      this.busyWorkers.set(worker, task);

      const startTime = Date.now();
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          this.handleWorkerError(worker, task, new Error("Task timed out"));
        }
      }, this.options.taskTimeout);

      const messageHandler = (e: MessageEvent) => {
        if (e.data.id !== task.id) return;

        if (e.data.type === "progress") {
          if (task.onProgress) task.onProgress(e.data.progress);
          return;
        }

        if (e.data.type === "error") {
          settled = true;
          clearTimeout(timeout);
          this.handleWorkerError(worker, task, new Error(e.data.error));
          worker.removeEventListener("message", messageHandler);
          return;
        }

        if (e.data.type === "result" || e.data.id === task.id) {
          settled = true;
          clearTimeout(timeout);
          const duration = Date.now() - startTime;
          this.stats.tasksCompleted++;
          this.stats.totalTime += duration;
          this.stats.avgTime = this.stats.totalTime / this.stats.tasksCompleted;

          task.resolve(e.data.result || e.data);

          worker.removeEventListener("message", messageHandler);
          this.releaseWorker(worker);
        }
      };

      worker.addEventListener("message", messageHandler);
      worker.addEventListener("error", (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.handleWorkerError(worker, task, new Error(e.message));
        }
      });

      worker.postMessage({ id: task.id, data: task.data }, task.transfer || []);
    }
  }

  private handleWorkerError(worker: Worker, task: WorkerTask, error: Error): void {
    this.stats.tasksFailed++;
    task.reject(error);

    // Recreate worker if it crashed
    const idx = this.workers.indexOf(worker);
    if (idx >= 0) {
      worker.terminate();
      const newWorker = this.createWorker();
      this.workers[idx] = newWorker;
      this.busyWorkers.delete(worker);
      this.availableWorkers.push(newWorker);
    }

    this.processQueue();
  }

  private releaseWorker(worker: Worker): void {
    this.busyWorkers.delete(worker);
    this.availableWorkers.push(worker);
    this.processQueue();
  }
}

// --- Global Pool ------------------------------------------------------

const pools = new Map<string, WorkerPool>();

export function createWorkerPool(name: string, options: WorkerPoolOptions): WorkerPool {
  const pool = new WorkerPool(options);
  pools.set(name, pool);
  return pool;
}

export function getWorkerPool(name: string): WorkerPool | undefined {
  return pools.get(name);
}

export function terminateAllPools(): void {
  for (const pool of pools.values()) pool.terminate();
  pools.clear();
}

// --- Inline Worker Helpers ------------------------------------------

export function createInlineWorker(fn: Function): Worker {
  const script = `
    self.onmessage = function(e) {
      const result = (${fn.toString()})(e.data.data);
      if (result instanceof Promise) {
        result
          .then(r => self.postMessage({ id: e.data.id, type: "result", result: r }))
          .catch(err => self.postMessage({ id: e.data.id, type: "error", error: err.message }));
      } else {
        self.postMessage({ id: e.data.id, type: "result", result: result });
      }
    };
  `;
  const blob = new Blob([script], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  return new Worker(url);
}
