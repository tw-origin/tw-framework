import { describe, test, expect } from "bun:test";
import { createDb, createSqlAdapter, createKvAdapter, createVectorAdapter } from "../packages/server/tw/db-runtime.ts";

// strategies.db.adapter: sql | kv | vector. Real adapters, not a label.

describe("db: factory", () => {
  test("picks sql by default and by name", async () => {
    expect((await createDb()).adapter).toBe("sql");
    expect((await createDb({ adapter: "sql" })).adapter).toBe("sql");
  });
  test("kv and vector are honoured", async () => {
    expect((await createDb({ adapter: "kv" })).adapter).toBe("kv");
    expect((await createDb({ adapter: "vector" })).adapter).toBe("vector");
  });
  test("an unknown adapter falls back to sql", async () => {
    expect((await createDb({ adapter: "mongo" as any })).adapter).toBe("sql");
  });
  test("the shared store surface works for every adapter", async () => {
    for (const adapter of ["sql", "kv"] as const) {
      const db = await createDb({ adapter });
      await db.store.set("k", { n: 1 });
      expect(await db.store.get("k")).toEqual({ n: 1 });
      expect(await db.store.delete("k")).toBe(true);
      expect(await db.store.get("k")).toBeNull();
      await db.close();
    }
  });
});

describe("db: sql adapter (real bun:sqlite)", () => {
  test("runs real SQL and reads rows back", async () => {
    const sql = await createSqlAdapter();
    await sql.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
    await sql.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Ada", 36]);
    await sql.run("INSERT INTO users (name, age) VALUES (?, ?)", ["Bea", 41]);
    const all = await sql.all<{ name: string }>("SELECT name FROM users ORDER BY age");
    expect(all.map((r) => r.name)).toEqual(["Ada", "Bea"]);
    const one = await sql.one<{ name: string }>("SELECT name FROM users WHERE age > ?", [40]);
    expect(one?.name).toBe("Bea");
    await sql.close();
  });

  test("a transaction rolls back on a throw", async () => {
    const sql = await createSqlAdapter();
    await sql.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    await sql.run("INSERT INTO t (v) VALUES ('keep')");
    await expect(sql.transaction(async (tx) => {
      await tx.run("INSERT INTO t (v) VALUES ('drop')");
      throw new Error("abort");
    })).rejects.toThrow(/abort/);
    expect((await sql.all("SELECT v FROM t")).length).toBe(1);
    await sql.close();
  });

  test("a committed transaction keeps its rows", async () => {
    const sql = await createSqlAdapter();
    await sql.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    await sql.transaction(async (tx) => {
      await tx.run("INSERT INTO t (v) VALUES ('a')");
      await tx.run("INSERT INTO t (v) VALUES ('b')");
    });
    expect((await sql.all("SELECT v FROM t")).length).toBe(2);
    await sql.close();
  });
});

describe("db: kv adapter", () => {
  test("set/get/delete round-trips", async () => {
    const kv = createKvAdapter();
    await kv.set("a", 1);
    expect(await kv.get("a")).toBe(1);
    expect(await kv.delete("a")).toBe(true);
    expect(await kv.get("a")).toBeNull();
  });
  test("setEx expires a key", async () => {
    const kv = createKvAdapter();
    await kv.setEx("tmp", "v", -1);
    expect(await kv.get("tmp")).toBeNull();
  });
  test("incr is atomic and returns the new value", async () => {
    const kv = createKvAdapter();
    expect(await kv.incr("hits")).toBe(1);
    expect(await kv.incr("hits")).toBe(2);
    expect(await kv.incr("hits", 5)).toBe(7);
  });
  test("keys scans by prefix", async () => {
    const kv = createKvAdapter();
    await kv.set("user:1", 1);
    await kv.set("user:2", 2);
    await kv.set("post:1", 3);
    expect((await kv.keys("user:")).sort()).toEqual(["user:1", "user:2"]);
    expect(await kv.size()).toBe(3);
  });
});

describe("db: vector adapter", () => {
  test("search returns nearest by cosine similarity", async () => {
    const v = createVectorAdapter({ dimensions: 3 });
    await v.upsert({ id: "a", vector: [1, 0, 0] });
    await v.upsert({ id: "b", vector: [0, 1, 0] });
    await v.upsert({ id: "c", vector: [0.9, 0.1, 0] });
    const hits = await v.search([1, 0, 0], 2);
    expect(hits[0].id).toBe("a");
    expect(hits[1].id).toBe("c");
    expect(hits[0].score).toBeCloseTo(1, 5);
  });
  test("a wrong-length vector is rejected", async () => {
    const v = createVectorAdapter({ dimensions: 3 });
    await expect(v.upsert({ id: "x", vector: [1, 2] })).rejects.toThrow(/dimensions/);
  });
  test("upsert replaces an existing id", async () => {
    const v = createVectorAdapter({ dimensions: 2 });
    await v.upsert({ id: "a", vector: [1, 0] });
    await v.upsert({ id: "a", vector: [0, 1] });
    const hits = await v.search([0, 1], 1);
    expect(hits.length).toBe(1);
    expect(hits[0].vector).toEqual([0, 1]);
  });
});
