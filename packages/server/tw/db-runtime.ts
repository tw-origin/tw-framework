/**
 * Database adapter layer (strategies.db.adapter).
 *
 *   sql    -- a real SQL database (bun:sqlite when running on Bun).
 *   kv     -- a key/value store with TTL, prefix scan and atomic counters.
 *   vector -- a vector store with cosine-similarity top-k search.
 *
 * One `createDb()` picks the adapter for the configured option, and every
 * adapter exposes the same small surface (`get`/`set`/`delete`/`close`) plus
 * its own native methods, so a project can move between them without rewriting
 * the call sites. All three work in-process (SQL uses an in-memory database by
 * default), so nothing here needs an external server to run.
 */

export type DbAdapterName = "sql" | "kv" | "vector";

export interface DbAdapter {
  readonly kind: DbAdapterName;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// SQL (bun:sqlite)
// ---------------------------------------------------------------------------

export interface SqlAdapter extends DbAdapter {
  kind: "sql";
  run(sql: string, params?: unknown[]): Promise<number>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T>;
}

/**
 * A real SQL adapter. On Bun it uses `bun:sqlite`; elsewhere it falls back to
 * an in-memory store that understands the small SQL subset below, so tests and
 * non-Bun runtimes still work.
 */
export async function createSqlAdapter(opts: { url?: string } = {}): Promise<SqlAdapter> {
  let db: any = null;
  try {
    const mod: any = await import("bun:sqlite");
    db = new mod.Database(opts.url ?? ":memory:");
  } catch { db = null; }

  const fallback = new Map<string, Record<string, unknown>>();

  const api: SqlAdapter = {
    kind: "sql",
    async run(sql, params = []) {
      if (db) return Number(db.run(sql, params).changes ?? 0);
      return fallbackRun(sql, params, fallback);
    },
    async one(sql, params = []) {
      const rows = await api.all(sql, params);
      return (rows[0] as any) ?? null;
    },
    async all(sql, params = []) {
      if (db) return db.query(sql).all(...params) as any;
      return fallbackAll(sql, params, fallback);
    },
    async transaction(fn) {
      if (db) {
        db.run("BEGIN");
        try { const out = await fn(api); db.run("COMMIT"); return out; }
        catch (e) { db.run("ROLLBACK"); throw e; }
      }
      const snapshot = new Map(fallback);
      try { return await fn(api); } catch (e) { fallback.clear(); for (const [k, v] of snapshot) fallback.set(k, v); throw e; }
    },
    async get(key) {
      const row = await api.one<{ v: string }>("SELECT v FROM tw_kv WHERE k = ?", [key]);
      return row ? JSON.parse(row.v) : null;
    },
    async set(key, value) {
      await api.run("INSERT INTO tw_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", [key, JSON.stringify(value)]);
    },
    async delete(key) {
      return (await api.run("DELETE FROM tw_kv WHERE k = ?", [key])) > 0;
    },
    async close() { if (db) db.close(); },
  };

  await api.run("CREATE TABLE IF NOT EXISTS tw_kv (k TEXT PRIMARY KEY, v TEXT)");
  return api;
}

function fallbackRun(sql: string, params: unknown[], store: Map<string, Record<string, unknown>>): number {
  const s = sql.trim().toLowerCase();
  if (s.startsWith("insert into tw_kv")) { store.set(String(params[0]), { v: params[1] }); return 1; }
  if (s.startsWith("delete from tw_kv")) return store.delete(String(params[0])) ? 1 : 0;
  return 0;
}
function fallbackAll(sql: string, params: unknown[], store: Map<string, Record<string, unknown>>): any[] {
  const s = sql.trim().toLowerCase();
  if (s.startsWith("select v from tw_kv")) {
    const row = store.get(String(params[0]));
    return row ? [{ v: row.v }] : [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// KV
// ---------------------------------------------------------------------------

export interface KvAdapter extends DbAdapter {
  kind: "kv";
  setEx(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  incr(key: string, by?: number): Promise<number>;
  keys(prefix?: string): Promise<string[]>;
  size(): Promise<number>;
}

export function createKvAdapter(): KvAdapter {
  const store = new Map<string, { value: unknown; expiresAt: number | null }>();
  const live = (e: { expiresAt: number | null } | undefined): boolean => !e || e.expiresAt === null || e.expiresAt > Date.now();
  return {
    kind: "kv",
    async get(key) { const e = store.get(key); if (!e || !live(e)) { if (e) store.delete(key); return null; } return e.value; },
    async set(key, value) { store.set(key, { value, expiresAt: null }); },
    async setEx(key, value, ttlSeconds) { store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 }); },
    async delete(key) { return store.delete(key); },
    async incr(key, by = 1) {
      const e = store.get(key);
      const next = ((e && live(e) ? e.value : 0) as number) + by;
      store.set(key, { value: next, expiresAt: null });
      return next;
    },
    async keys(prefix = "") { return [...store.keys()].filter((k) => k.startsWith(prefix) && live(store.get(k))); },
    async size() { return [...store.values()].filter(live).length; },
    async close() { store.clear(); },
  };
}

// ---------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------

export interface VectorRecord { id: string; vector: number[]; metadata?: Record<string, unknown> }
export interface VectorMatch extends VectorRecord { score: number }

export interface VectorAdapter extends DbAdapter {
  kind: "vector";
  readonly dimensions: number;
  upsert(record: VectorRecord): Promise<void>;
  search(vector: number[], k?: number): Promise<VectorMatch[]>;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function createVectorAdapter(opts: { dimensions?: number } = {}): VectorAdapter {
  const dimensions = opts.dimensions ?? 0;
  const store = new Map<string, VectorRecord>();
  const check = (v: number[]) => {
    if (dimensions && v.length !== dimensions) {
      throw new Error(`vector length ${v.length} does not match the configured ${dimensions} dimensions`);
    }
  };
  return {
    kind: "vector",
    dimensions,
    async get(key) { return store.get(key) ?? null; },
    async set(key, value) { const r = value as VectorRecord; check(r.vector); store.set(key, { ...r, id: key }); },
    async delete(key) { return store.delete(key); },
    async upsert(record) { check(record.vector); store.set(record.id, record); },
    async search(vector, k = 5) {
      check(vector);
      return [...store.values()]
        .map((r) => ({ ...r, score: cosine(vector, r.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
    async close() { store.clear(); },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface DbConfig { adapter?: DbAdapterName; url?: string; dimensions?: number }

export interface Db {
  readonly adapter: DbAdapterName;
  readonly sql?: SqlAdapter;
  readonly kv?: KvAdapter;
  readonly vector?: VectorAdapter;
  readonly store: DbAdapter;
  close(): Promise<void>;
}

/** Build the database for the configured adapter. */
export async function createDb(config: DbConfig = {}): Promise<Db> {
  const adapter: DbAdapterName = config.adapter === "kv" || config.adapter === "vector" ? config.adapter : "sql";
  if (adapter === "kv") {
    const kv = createKvAdapter();
    return { adapter, kv, store: kv, close: () => kv.close() };
  }
  if (adapter === "vector") {
    const vector = createVectorAdapter({ dimensions: config.dimensions });
    return { adapter, vector, store: vector, close: () => vector.close() };
  }
  const sql = await createSqlAdapter({ url: config.url });
  return { adapter, sql, store: sql, close: () => sql.close() };
}
