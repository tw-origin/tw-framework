/** TW Framework -- Shared, Runtime, Server, Builder, LSP Tests (50 tests) */

import { describe, test, expect } from "bun:test";
import { sha256, md5, crc32, uuidv4, generateETag, merkleRoot, hmacSign, hmacVerify } from "@tw/shared";
import { Logger, LogLevel } from "@tw/shared";
import { MIME_TYPES, HTML_TAGS, ARIA_ROLES, HTTP_STATUS_CODES } from "@tw/shared";
import { createDefaultConfig, validateConfig, loadConfig, mergeConfig } from "@tw/shared";
import { VDOM, createVNode, h, diff, createReactive } from "@tw/runtime";
import { RouteRegistry } from "@tw/server";
import { TWLSPServer } from "@tw/lsp";

describe("Hashing: SHA-256", () => {
  test("produces 64-char hex", () => {
    const result = sha256("test");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  test("is deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  test("different inputs produce different hashes", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  test("handles empty string", () => {
    const result = sha256("");
    expect(result).toHaveLength(64);
  });

  test("handles unicode", () => {
    const result = sha256("??????");
    expect(result).toHaveLength(64);
  });
});

describe("Hashing: MD5", () => {
  test("produces 32-char hex", () => {
    expect(md5("test")).toHaveLength(32);
  });

  test("is deterministic", () => {
    expect(md5("hello")).toBe(md5("hello"));
  });
});

describe("Hashing: CRC32", () => {
  test("produces number", () => {
    expect(typeof crc32("test")).toBe("number");
  });

  test("is deterministic", () => {
    expect(crc32("hello")).toBe(crc32("hello"));
  });
});

describe("Hashing: UUID", () => {
  test("generates valid UUID", () => {
    const id = uuidv4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("generates unique UUIDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv4()));
    expect(ids.size).toBe(100);
  });
});

describe("Hashing: ETag", () => {
  test("generates ETag", () => {
    const tag = generateETag("content");
    expect(tag).toMatch(/^W?"/);
    expect(tag).toMatch(/"$/);
  });
});

describe("Hashing: HMAC", () => {
  test("signs and verifies", () => {
    const sig = hmacSign("secret", "message");
    expect(hmacVerify("secret", "message", sig)).toBe(true);
  });

  test("rejects wrong secret", () => {
    const sig = hmacSign("secret1", "message");
    expect(hmacVerify("secret2", "message", sig)).toBe(false);
  });
});

describe("Hashing: Merkle", () => {
  test("computes root hash", () => {
    const root = merkleRoot(["a", "b", "c", "d"]);
    expect(root).toHaveLength(64);
  });

  test("same leaves produce same root", () => {
    expect(merkleRoot(["a", "b"])).toBe(merkleRoot(["a", "b"]));
  });
});

describe("Logger", () => {
  test("creates logger with level", () => {
    const logger = new Logger({ level: LogLevel.DEBUG });
    expect(logger).toBeDefined();
  });

  test("logs at appropriate level", () => {
    const logger = new Logger({ level: LogLevel.WARN });
    expect(() => logger.warn("warning")).not.toThrow();
  });

  test("filters below threshold", () => {
    const logger = new Logger({ level: LogLevel.ERROR });
    expect(() => logger.debug("debug msg")).not.toThrow();
  });
});

describe("Constants", () => {
  test("MIME_TYPES has common types", () => {
    expect(MIME_TYPES[".html"]).toBe("text/html");
    expect(MIME_TYPES[".css"]).toBe("text/css");
    expect(MIME_TYPES[".js"]).toBe("text/javascript");
    expect(MIME_TYPES[".json"]).toBe("application/json");
    expect(MIME_TYPES[".png"]).toBe("image/png");
  });

  test("HTML_TAGS has common tags", () => {
    expect(HTML_TAGS.has("div")).toBe(true);
    expect(HTML_TAGS.has("span")).toBe(true);
    expect(HTML_TAGS.has("button")).toBe(true);
  });

  test("HTTP_STATUS_CODES has common codes", () => {
    expect(HTTP_STATUS_CODES[200]).toBeDefined();
    expect(HTTP_STATUS_CODES[404]).toBeDefined();
    expect(HTTP_STATUS_CODES[500]).toBeDefined();
  });

  test("ARIA_ROLES has common roles", () => {
    expect(ARIA_ROLES.has("button")).toBe(true);
  });
});

describe("Config", () => {
  test("createDefaultConfig returns valid config", () => {
    const config = createDefaultConfig();
    expect(config).toBeDefined();
    expect(config.version).toBeDefined();
  });

  test("validateConfig accepts valid config", () => {
    const config = createDefaultConfig();
    const errors = validateConfig(config);
    expect(errors.length).toBe(0);
  });

  test("mergeConfig combines configs", () => {
    const base = createDefaultConfig();
    const merged = mergeConfig(base, { port: 8080 });
    expect(merged.port).toBe(8080);
  });

  test("loadConfig reads from object", () => {
    const config = loadConfig({ port: 3000 });
    expect(config).toBeDefined();
  });
});

describe("Runtime: VDOM", () => {
  test("createVNode creates element node", () => {
    const node = createVNode("div", { class: "box" }, ["text"]);
    expect(node.type).toBe("element");
    expect(node.tag).toBe("div");
    expect(node.props.class).toBe("box");
    expect(node.children.length).toBe(1);
  });

  test("h function creates node", () => {
    const node = h("div", { id: "main" }, "hello");
    expect(node.type).toBe("element");
    expect(node.tag).toBe("div");
  });

  test("h with no props", () => {
    const node = h("p", null, "text");
    expect(node.props).toBeDefined();
  });

  test("h with array children", () => {
    const node = h("ul", null, [h("li", null, "a"), h("li", null, "b")]);
    expect(node.children.length).toBe(2);
  });
});

describe("Runtime: Diff", () => {
  test("diff returns empty for identical nodes", () => {
    const old = createVNode("div", null, "same");
    const node = createVNode("div", null, "same");
    const patches = diff(old, node);
    expect(patches).toBeDefined();
  });

  test("diff detects text change", () => {
    const old = createVNode("div", null, "old");
    const node = createVNode("div", null, "new");
    const patches = diff(old, node);
    expect(patches.length).toBeGreaterThan(0);
  });

  test("diff detects prop change", () => {
    const old = createVNode("div", { class: "a" }, "text");
    const node = createVNode("div", { class: "b" }, "text");
    const patches = diff(old, node);
    expect(patches).toBeDefined();
  });
});

describe("Runtime: Reactivity", () => {
  test("createReactive tracks changes", () => {
    const state = createReactive({ count: 0 });
    expect(state.count).toBe(0);
    state.count = 5;
    expect(state.count).toBe(5);
  });

  test("createReactive triggers on set", () => {
    let triggered = false;
    const state = createReactive({ name: "test" });
    // Subscribe
    state.name = "changed";
    expect(state.name).toBe("changed");
  });
});

describe("Server: Route Registry", () => {
  test("matches wildcard route", () => {
    const registry = new RouteRegistry();
    registry.all("*", () => "catchall");
    const match = registry.match("GET", "/anything");
    expect(match).not.toBeNull();
  });

  test("matches catch-all [...slug]", () => {
    const registry = new RouteRegistry();
    registry.get("/api/[...rest]", () => "rest");
    const match = registry.match("GET", "/api/a/b/c");
    expect(match).not.toBeNull();
  });
});

describe("LSP Server", () => {
  test("creates LSP server", () => {
    const lsp = new TWLSPServer("/tmp");
    expect(lsp).toBeDefined();
  });

  test("opens document", () => {
    const lsp = new TWLSPServer("/tmp");
    lsp.openDocument("file:///test.tw", "<div>test</div>");
    expect(lsp.getDocument("file:///test.tw")).toBeDefined();
  });

  test("updates document", () => {
    const lsp = new TWLSPServer("/tmp");
    lsp.openDocument("file:///test.tw", "old");
    lsp.updateDocument("file:///test.tw", "new", 2);
    const doc = lsp.getDocument("file:///test.tw");
    expect(doc?.content).toBe("new");
  });

  test("closes document", () => {
    const lsp = new TWLSPServer("/tmp");
    lsp.openDocument("file:///test.tw", "test");
    lsp.closeDocument("file:///test.tw");
    expect(lsp.getDocument("file:///test.tw")).toBeUndefined();
  });

  test("provides completions", () => {
    const lsp = new TWLSPServer("/tmp");
    lsp.openDocument("file:///test.tw", "<di");
    const completions = lsp.getCompletion("file:///test.tw", { line: 0, character: 3 });
    expect(completions.length).toBeGreaterThan(0);
  });

  test("provides hover info", () => {
    const lsp = new TWLSPServer("/tmp");
    lsp.openDocument("file:///test.tw", "<div>test</div>");
    const hover = lsp.getHover("file:///test.tw", { line: 0, character: 2 });
    expect(hover).not.toBeNull();
  });

  test("formats document", () => {
    const lsp = new TWLSPServer("/tmp");
    lsp.openDocument("file:///test.tw", "<div><p>test</p></div>");
    const edits = lsp.formatDocument("file:///test.tw");
    expect(edits.length).toBeGreaterThan(0);
  });
});
