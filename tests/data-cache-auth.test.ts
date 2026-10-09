import { describe, test, expect } from "bun:test";
import { resolveDataLayer, describeDataLayer, DATA_LAYERS } from "../packages/shared/tw/config/data-layers.ts";
import { resolveCacheMode, cacheControlFor, purgeManifest, CACHE_MODES } from "../packages/shared/tw/config/cache-modes.ts";
import { resolveAuthModel, describeAuthModel, AUTH_MODELS } from "../packages/shared/tw/config/auth-models.ts";
import { ensurePackages } from "../packages/shared/tw/config/package-manager.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmp(): string { return mkdtempSync(join(tmpdir(), "tw-dca-")); }
function fakePkg(dir: string, name: string): void {
  mkdirSync(join(dir, "node_modules", name), { recursive: true });
  writeFileSync(join(dir, "node_modules", name, "package.json"), "{}");
}

// 266 data layer, 267 cache mode, 268 auth model.

describe("data layer: resolution", () => {
  test("defaults to routes", () => {
    expect(resolveDataLayer({})).toBe("routes");
    expect(resolveDataLayer({ strategies: { data: { layer: "bogus" } } })).toBe("routes");
  });
  test("graphql and trpc are read from the strategy", () => {
    expect(resolveDataLayer({ strategies: { data: { layer: "graphql" } } })).toBe("graphql");
    expect(resolveDataLayer({ strategies: { data: { layer: "trpc" } } })).toBe("trpc");
  });
  test("routes needs no packages; the others name theirs", () => {
    expect(DATA_LAYERS.routes.packages).toEqual([]);
    expect(DATA_LAYERS.graphql.packages).toContain("graphql");
    expect(DATA_LAYERS.trpc.packages.length).toBeGreaterThan(0);
  });
  test("describeDataLayer reports the missing packages", () => {
    const dir = tmp();
    try {
      const d = describeDataLayer("graphql", dir);
      expect(d.available).toBe(false);
      expect(d.missing).toContain("graphql");
      fakePkg(dir, "graphql");
      expect(describeDataLayer("graphql", dir).available).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("cache mode: resolution", () => {
  test("defaults to isr", () => {
    expect(resolveCacheMode({})).toBe("isr");
    expect(resolveCacheMode({ strategies: { cache: { mode: "bogus" } } })).toBe("isr");
  });
  test("each mode is read", () => {
    for (const m of ["swr", "none", "cdn"]) {
      expect(resolveCacheMode({ strategies: { cache: { mode: m } } })).toBe(m);
    }
  });
});

describe("cache mode: Cache-Control", () => {
  test("none forbids caching", () => {
    expect(cacheControlFor("none", 60)).toBe("no-cache, no-store, must-revalidate");
  });
  test("swr carries stale-while-revalidate", () => {
    expect(cacheControlFor("swr", 60)).toContain("stale-while-revalidate=");
  });
  test("cdn defers to s-maxage", () => {
    expect(cacheControlFor("cdn", 300)).toBe("public, max-age=0, s-maxage=300");
  });
  test("isr is the default shape", () => {
    expect(cacheControlFor("isr", 60)).toContain("s-maxage=60");
  });
  test("serverCache flags are right", () => {
    expect(CACHE_MODES.isr.serverCache).toBe(true);
    expect(CACHE_MODES.swr.serverCache).toBe(true);
    expect(CACHE_MODES.none.serverCache).toBe(false);
    expect(CACHE_MODES.cdn.serverCache).toBe(false);
  });
});

describe("cache mode: cdn purge manifest", () => {
  test("lists the routes", () => {
    const m = purgeManifest([{ path: "/", tags: [] }, { path: "/about", tags: ["page"] }]);
    expect(m?.generatedFor).toBe("cdn");
    expect(m?.routes.length).toBe(2);
    expect(m?.routes[1].tags).toEqual(["page"]);
  });
  test("an empty site still yields a manifest", () => {
    expect(purgeManifest([])?.routes).toEqual([]);
  });
});

describe("auth model: resolution", () => {
  test("defaults to session", () => {
    expect(resolveAuthModel({})).toBe("session");
    expect(resolveAuthModel({ strategies: { auth: { model: "bogus" } } })).toBe("session");
  });
  test("jwt and oauth are read", () => {
    expect(resolveAuthModel({ strategies: { auth: { model: "jwt" } } })).toBe("jwt");
    expect(resolveAuthModel({ strategies: { auth: { model: "oauth" } } })).toBe("oauth");
  });
  test("each model names its @tw/security provider", () => {
    expect(AUTH_MODELS.session.provider).toBe("createSessionManager");
    expect(AUTH_MODELS.jwt.provider).toBe("createJWTManager");
    expect(AUTH_MODELS.oauth.packages).toContain("oauth4webapi");
  });
  test("describeAuthModel reports availability", () => {
    const dir = tmp();
    try {
      expect(describeAuthModel("session", dir).available).toBe(true);
      expect(describeAuthModel("oauth", dir).available).toBe(false);
      fakePkg(dir, "oauth4webapi");
      expect(describeAuthModel("oauth", dir).available).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("optional packages: ensure", () => {
  test("nothing to do when they are present", async () => {
    const dir = tmp();
    try {
      fakePkg(dir, "graphql");
      const r = await ensurePackages(dir, ["graphql"], "data.layer=graphql", { interactive: false });
      expect(r.ok).toBe(true);
      expect(r.installed).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("non-interactive reports how to install, never throws", async () => {
    const dir = tmp();
    try {
      const r = await ensurePackages(dir, ["graphql"], "data.layer=graphql", { interactive: false });
      expect(r.ok).toBe(false);
      expect(r.missing).toContain("graphql");
      expect(String(r.message)).toContain("graphql");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
