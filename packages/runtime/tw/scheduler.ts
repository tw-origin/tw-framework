/**
 * scheduler.ts -- TW Framework runtime scheduler (upgraded)
 *
 * Upgrades over the previous version:
 *  - Exports `SchedulePriority` as a type alias for `Priority` (index.ts
 *    re-exports it under that name; now it actually resolves here).
 *  - `getStats()` returns real per-flush counters (jobsRun / jobsSkipped /
 *    timeSpent) captured during the most recent flush, instead of hardcoded 0s.
 *  - `peekQueue()` lets callers inspect pending jobs without flushing.
 *  - `nextTick` enqueues as a "low" priority job on the same scheduler; the
 *    flush itself runs on a microtask (`queueMicrotask`), so callbacks still
 *    fire in the microtask phase -- after already-queued high/normal work.
 *  - `isScheduled()` reports whether a flush is pending.
 *  - Jobs within a priority queue are stable-sorted by insertion order, so
 *    equal-priority work runs in the order it was enqueued.
 *  - `unknown` is used instead of `any` throughout.
 */

/* --------------------------------------------------------------------------
 * Priority
 * -------------------------------------------------------------------------- */

/**
 * Job priority levels. Higher priority runs first within a flush.
 * `Priority` is the canonical name used internally; `SchedulePriority` is the
 * public alias index.ts re-exports.
 */
export type Priority = "high" | "normal" | "low";

/** Public alias -- kept so `index.ts`'s `export { ... as SchedulePriority }`
 *  resolves to a real type declared in this module. */
export type SchedulePriority = Priority;

/** Numeric ordering for priority comparison (higher = runs earlier). */
const PRIORITY_RANK: Readonly<Record<Priority, number>> = Object.freeze({
  high: 3,
  normal: 2,
  low: 1,
});

/* --------------------------------------------------------------------------
 * Job
 * -------------------------------------------------------------------------- */

/** A unit of scheduled work. */
export interface ScheduledJob {
  /** The callback to invoke. */
  fn: () => unknown;
  /** Priority bucket. */
  priority: Priority;
  /** Monotonic insertion counter -- used for stable ordering within a bucket. */
  seq: number;
  /** Optional identity key for deduplication. */
  id?: string | number;
}

/** Pending jobs grouped by priority bucket. */
interface JobQueues {
  high: ScheduledJob[];
  normal: ScheduledJob[];
  low: ScheduledJob[];
}

/* --------------------------------------------------------------------------
 * Stats (real, per-flush)
 * -------------------------------------------------------------------------- */

export interface SchedulerStats {
  jobsRun: number;
  /** Alias of `jobsRun`, kept for API parity with other stats-returning helpers. */
  totalJobsRun: number;
  jobsSkipped: number;
  /** Wall-clock time (ms) spent in the most recent flush. */
  timeSpent: number;
  /** Jobs currently pending across all priority buckets. */
  pending: number;
}

/** Zero-initialised stats; updated on every flush. */
let lastStats: SchedulerStats = {
  jobsRun: 0,
  totalJobsRun: 0,
  jobsSkipped: 0,
  timeSpent: 0,
  pending: 0,
};

/* --------------------------------------------------------------------------
 * Queue state
 * -------------------------------------------------------------------------- */

const queues: JobQueues = {
  high: [],
  normal: [],
  low: [],
};

/** Monotonic insertion counter for stable ordering. */
let seqCounter = 0;

/** Is a flush already scheduled for the next microtask? */
let flushScheduled = false;

/* --------------------------------------------------------------------------
 * nextTick -- low-priority job on the shared scheduler.
 *
 * Resolvers are fired in registration order. The scheduler's flush runs on a
 * microtask, so callbacks still execute in the microtask phase -- but after
 * high/normal jobs enqueued before them, not on a separate queue.
 * -------------------------------------------------------------------------- */

/** Schedule `cb` to run on the next flush, as a low-priority job. Returns a
 *  promise that resolves once `cb` has run (whether via `flushSync()` or the
 *  scheduler's own microtask-batched flush). */
export function nextTick(cb?: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    queueJob(() => {
      if (cb) {
        try {
          cb();
        } catch (err) {
          reportError(err);
        }
      }
      resolve();
    }, "low");
  });
}

/* --------------------------------------------------------------------------
 * Queue inspection & scheduling state
 * -------------------------------------------------------------------------- */

/** Is a flush currently pending (scheduled but not yet run)? */
export function isScheduled(): boolean {
  return flushScheduled;
}

/**
 * Peek at pending jobs without flushing.
 *
 * Returns a shallow-copied array of ScheduledJob, ordered by priority (high ->
 * normal -> low) and, within a priority, by insertion order (stable). This is
 * the exact order in which jobs would run on the next flush.
 */
export function peekQueue(priority?: Priority): ScheduledJob[] {
  const ordered: ScheduledJob[] = [];

  if (priority !== undefined) {
    // Stable within a single bucket: already in insertion order.
    ordered.push(...queues[priority]);
    return ordered;
  }

  // Across buckets: high first, then normal, then low. Within each bucket the
  // array is already in insertion order (stable).
  ordered.push(...queues.high, ...queues.normal, ...queues.low);
  return ordered;
}

/* --------------------------------------------------------------------------
 * Queueing jobs
 * -------------------------------------------------------------------------- */

/** Deduplicate within a bucket by id when present. */
function dedupeInto(bucket: ScheduledJob[], job: ScheduledJob): void {
  if (job.id !== undefined) {
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].id === job.id) {
        // Replace the earlier queued version; keep its seq so ordering of
        // equal-priority dupes follows the original enqueue time (stable).
        job.seq = bucket[i].seq;
        bucket[i] = job;
        dedupedSinceFlush++;
        return;
      }
    }
  }
  bucket.push(job);
}

/** Jobs dropped by id-dedupe since the last flush (reported as jobsSkipped). */
let dedupedSinceFlush = 0;

/** Enqueue a job. `priority` defaults to "normal". */
export function queueJob(
  fn: () => unknown,
  priority: Priority = "normal",
  id?: string | number,
): void {
  const job: ScheduledJob = {
    fn,
    priority,
    seq: seqCounter++,
    id,
  };

  // Insert into the correct bucket, preserving insertion order (stable).
  switch (priority) {
    case "high":
      dedupeInto(queues.high, job);
      break;
    case "low":
      dedupeInto(queues.low, job);
      break;
    default:
      dedupeInto(queues.normal, job);
      break;
  }

  if (!flushScheduled) {
    scheduleFlush();
  }
}

/* --------------------------------------------------------------------------
 * Flushing
 * -------------------------------------------------------------------------- */

/** Schedule a flush on the microtask queue (coalesced). */
function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flush);
}

/**
 * Stable sort comparator for jobs within a flush: priority first (higher runs
 * earlier), then insertion order (`seq`, ascending). Stable across equal-priority
 * jobs -- preserves enqueue order.
 */
function jobOrder(a: ScheduledJob, b: ScheduledJob): number {
  const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (rankDiff !== 0) return rankDiff;
  return a.seq - b.seq;
}

/** Run all pending jobs, in priority + insertion order. */
export function flush(): void {
  flushScheduled = false;

  const start =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  let jobsRun = 0;
  const jobsSkipped = dedupedSinceFlush;
  dedupedSinceFlush = 0;

  // Drain: collect all pending jobs, stable-sort, then run. Re-entrancy (a job
  // that queues more jobs) is handled by looping until all buckets are empty.
  // Guard against infinite loops with a generation cap.
  let guard = 0;
  while (guard++ < 1000) {
    const all: ScheduledJob[] = [
      ...queues.high,
      ...queues.normal,
      ...queues.low,
    ];
    queues.high.length = 0;
    queues.normal.length = 0;
    queues.low.length = 0;

    if (all.length === 0) break;

    all.sort(jobOrder);

    for (let i = 0; i < all.length; i++) {
      const job = all[i];
      try {
        job.fn();
      } catch (err) {
        reportError(err);
      }
      jobsRun++;
    }
  }

  const end =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  lastStats = {
    jobsRun,
    totalJobsRun: jobsRun,
    jobsSkipped,
    timeSpent: end - start,
    pending: pendingCount(),
  };
}

/** Current pending count across all buckets. */
function pendingCount(): number {
  return queues.high.length + queues.normal.length + queues.low.length;
}

/* --------------------------------------------------------------------------
 * Stats & maintenance
 * -------------------------------------------------------------------------- */

/**
 * Return stats from the most recent flush (and the current pending count).
 *
 * Previously these were hardcoded to 0; they now reflect real per-flush work.
 */
export function getStats(): SchedulerStats {
  return {
    jobsRun: lastStats.jobsRun,
    totalJobsRun: lastStats.jobsRun,
    jobsSkipped: lastStats.jobsSkipped,
    timeSpent: lastStats.timeSpent,
    pending: pendingCount(),
  };
}

/** Reset all queues and stats. Intended for tests. */
export function resetScheduler(): void {
  queues.high.length = 0;
  queues.normal.length = 0;
  queues.low.length = 0;
  seqCounter = 0;
  flushScheduled = false;
  lastStats = { jobsRun: 0, totalJobsRun: 0, jobsSkipped: 0, timeSpent: 0, pending: 0 };
}

/* --------------------------------------------------------------------------
 * Error reporting (avoid hard dependencies on host globals)
 * -------------------------------------------------------------------------- */
function reportError(err: unknown): void {
  // Prefer the host's error reporting hook if present, then console, then no-op.
  const host = globalThis as { __twReportError?: (e: unknown) => void };
  if (typeof host.__twReportError === "function") {
    try {
      host.__twReportError(err);
      return;
    } catch {
      /* fall through */
    }
  }
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(err);
  }
}

/* --------------------------------------------------------------------------
 * Public surface (for greppability):
 *   Priority, SchedulePriority, ScheduledJob, SchedulerStats,
 *   queueJob, flush, nextTick, peekQueue, isScheduled, getStats,
 *   resetScheduler
 * --------------------------------------------------------------------------
 */

/** Remove a previously scheduled job by id, if still pending. Returns true if a job was removed. */
export function cancel(id: string | number): boolean {
  for (const bucket of [queues.high, queues.normal, queues.low] as ScheduledJob[][]) {
    const idx = bucket.findIndex((job) => job.id === id);
    if (idx !== -1) {
      bucket.splice(idx, 1);
      return true;
    }
  }
  return false;
}

/** Monotonic counter for auto-generated job ids (returned by `schedule()` for cancellation). */
let autoIdCounter = 0;

// Aliases
export function schedule(fn: () => void, priority: Priority = "normal", id?: string | number): string | number {
  const jobId = id ?? `__auto_${++autoIdCounter}`;
  queueJob(fn, priority, jobId);
  return jobId;
}
export function flushSync(): void { flush(); }
export const reset = resetScheduler;
