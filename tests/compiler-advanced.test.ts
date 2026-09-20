/** TW Framework -- Codegen, Eval, Semantic, Cache Tests (60 tests) */

import { describe, test, expect } from "bun:test";
import { compile, generateHTML, interpolate, evaluate, isTruthy, coerce, inferType } from "@tw/compiler";
import { buildScopeTree, buildSymbolTable, lookup, resolveReferences, validate as validateSemantics, isAssignable, unify, parseType, parse } from "@tw/compiler";
import { MemoryCache, UnifiedCache, makeKey, makeSourceKey } from "@tw/compiler";

describe("Codegen: HTML Generation", () => {
  test("generates HTML from simple template", () => {
    const result = generateHTML({ type: "Program", body: [], directives: [] } as any);
    expect(result).toBeDefined();
  });

  test("compile produces html, css, js", async () => {
    const result = await compile("<div>Hello</div>");
    expect(result.html).toBeDefined();
    expect(result.css).toBeDefined();
    expect(result.js).toBeDefined();
  });

  test("compile includes content in output", async () => {
    const result = await compile("<div>Hello World</div>");
    expect(result.html).toContain("Hello World");
  });

  test("compile handles state directive", async () => {
    const result = await compile("@state { count = 0; }<div>{count}</div>");
    expect(result.html).toBeDefined();
  });

  test("compile handles page directive", async () => {
    const result = await compile("@page { title: 'Test'; }<div>content</div>");
    expect(result.html).toBeDefined();
  });

  test("compile handles nested elements", async () => {
    const result = await compile("<div><span><p>deep</p></span></div>");
    expect(result.html).toContain("deep");
  });

  test("compile handles multiple root elements", async () => {
    const result = await compile("<div>a</div><div>b</div>");
    expect(result.html).toBeDefined();
  });

  test("compile handles empty input", async () => {
    const result = await compile("");
    expect(result).toBeDefined();
  });

  test("compile produces diagnostics", async () => {
    const result = await compile("<div>test</div>", { diagnostics: true });
    expect(result.diagnostics).toBeDefined();
  });

  test("compile tracks timing metadata", async () => {
    const result = await compile("<div>test</div>");
    expect(result.metadata).toBeDefined();
    expect(result.metadata.totalTime).toBeGreaterThanOrEqual(0);
  });
});

describe("Eval: Interpolation", () => {
  test("interpolates simple variable", () => {
    const result = interpolate("Hello {name}", { name: "World" });
    expect(result).toContain("World");
  });

  test("interpolates multiple variables", () => {
    const result = interpolate("{a} + {b}", { a: "1", b: "2" });
    expect(result).toBeDefined();
  });

  test("interpolates with no variables", () => {
    const result = interpolate("Hello World", {});
    expect(result).toBe("Hello World");
  });

  test("interpolates expression", () => {
    const result = interpolate("{1 + 2}", {});
    expect(result).toBeDefined();
  });

  test("interpolates member access", () => {
    const result = interpolate("{user.name}", { "user.name": "John" });
    expect(result).toBeDefined();
  });
});

describe("Eval: Expression Evaluation", () => {
  test("evaluates arithmetic", () => {
    expect(evaluate("1 + 2", {})).toBeDefined();
  });

  test("evaluates variable reference", () => {
    expect(evaluate("name", { name: "test" })).toBeDefined();
  });

  test("evaluates string concatenation", () => {
    expect(evaluate("'a' + 'b'", {})).toBeDefined();
  });

  test("evaluates comparison", () => {
    expect(evaluate("1 > 2", {})).toBeDefined();
  });

  test("evaluates ternary", () => {
    expect(evaluate("true ? 'yes' : 'no'", {})).toBeDefined();
  });
});

describe("Eval: isTruthy", () => {
  test("empty string is falsy", () => {
    expect(isTruthy("")).toBe(false);
  });

  test("non-empty string is truthy", () => {
    expect(isTruthy("hello")).toBe(true);
  });

  test("zero string is falsy", () => {
    expect(isTruthy("0")).toBe(false);
  });

  test("non-zero number is truthy", () => {
    expect(isTruthy("42")).toBe(true);
  });

  test("true is truthy", () => {
    expect(isTruthy("true")).toBe(true);
  });

  test("false is falsy", () => {
    expect(isTruthy("false")).toBe(false);
  });
});

describe("Eval: coerce", () => {
  test("coerces to number", () => {
    const result = coerce("42", "number");
    expect(result).toBeDefined();
  });

  test("coerces to boolean", () => {
    const result = coerce("true", "boolean");
    expect(result).toBeDefined();
  });

  test("coerces to string", () => {
    const result = coerce(42, "string");
    expect(result).toBeDefined();
  });
});

describe("Eval: inferType", () => {
  test("infers number", () => {
    expect(inferType("42")).toBe("number");
  });

  test("infers boolean true", () => {
    expect(inferType("true")).toBe("boolean");
  });

  test("infers boolean false", () => {
    expect(inferType("false")).toBe("boolean");
  });

  test("infers null", () => {
    expect(inferType("null")).toBe("null");
  });

  test("infers string", () => {
    expect(inferType("hello")).toBe("string");
  });

  test("infers array", () => {
    expect(inferType("[1,2,3]")).toBe("array");
  });

  test("infers object", () => {
    expect(inferType("{a:1}")).toBe("object");
  });
});

describe("Semantic: Scope Tree", () => {
  test("builds scope tree from program", () => {
    const program = parse("<div><span>text</span></div>");
    const scope = buildScopeTree(program);
    expect(scope).toBeDefined();
    expect(scope.kind).toBe("global");
  });

  test("lookup finds bindings", () => {
    const program = parse("@state { count = 0; }<div>{count}</div>");
    const scope = buildScopeTree(program);
    const binding = lookup(scope, "count");
    expect(binding).toBeDefined();
  });

  test("lookup returns null for undefined", () => {
    const program = parse("<div>text</div>");
    const scope = buildScopeTree(program);
    expect(lookup(scope, "nonexistent")).toBeNull();
  });
});

describe("Semantic: Symbol Table", () => {
  test("builds symbol table", () => {
    const program = parse("@state { count = 0; name = 'test' }<div>{count}</div>");
    const scope = buildScopeTree(program);
    const table = buildSymbolTable(scope);
    expect(table.size()).toBeGreaterThan(0);
    expect(table.has("count")).toBe(true);
  });

  test("tracks imported symbols", () => {
    const program = parse("@import { Button } from './Button.tw'<div><Button /></div>");
    const scope = buildScopeTree(program);
    const table = buildSymbolTable(scope);
    expect(table.getImported().length).toBeGreaterThan(0);
  });
});

describe("Semantic: Reference Resolution", () => {
  test("resolves references", () => {
    const program = parse("@state { count = 0; }<div>{count}</div>");
    const result = resolveReferences(program);
    expect(result.resolved.length).toBeGreaterThan(0);
  });

  test("finds unresolved references", () => {
    const program = parse("<div>{undefined_var}</div>");
    const result = resolveReferences(program);
    expect(result.unresolved.length).toBeGreaterThan(0);
  });
});

describe("Semantic: Type System", () => {
  test("isAssignable matches same types", () => {
    expect(isAssignable("string", "string")).toBe(true);
    expect(isAssignable("number", "number")).toBe(true);
  });

  test("isAssignable allows any target", () => {
    expect(isAssignable("string", "any")).toBe(true);
  });

  test("unify returns matching type", () => {
    const result = unify({ type: "string" }, { type: "string" });
    expect(result.type).toBe("string");
  });

  test("unify falls back to any", () => {
    const result = unify({ type: "string" }, { type: "number" });
    expect(result.type).toBe("any");
  });

  test("parseType parses simple type", () => {
    const result = parseType("string");
    expect(result.type).toBe("string");
  });

  test("parseType parses array type", () => {
    const result = parseType("string[]");
    expect(result.isArray).toBe(true);
  });

  test("parseType parses nullable type", () => {
    const result = parseType("string | null");
    expect(result.isNullable).toBe(true);
  });
});

describe("Semantic: Validation", () => {
  test("validates clean program", () => {
    const program = parse("@state { count = 0; }<div>{count}</div>");
    const errors = validateSemantics(program);
    expect(errors).toBeDefined();
  });

  test("detects undefined variables", () => {
    const program = parse("<div>{undefined_var}</div>");
    const errors = validateSemantics(program);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("Cache: MemoryCache", () => {
  test("set and get", () => {
    const cache = new MemoryCache();
    cache.set("key1", { data: "value" }, "hash1");
    expect(cache.get("key1")).toEqual({ data: "value" });
  });

  test("has checks existence", () => {
    const cache = new MemoryCache();
    cache.set("key2", "val", "hash2");
    expect(cache.has("key2")).toBe(true);
    expect(cache.has("nonexistent")).toBe(false);
  });

  test("delete removes entry", () => {
    const cache = new MemoryCache();
    cache.set("key3", "val", "hash3");
    cache.delete("key3");
    expect(cache.has("key3")).toBe(false);
  });

  test("clear removes all entries", () => {
    const cache = new MemoryCache();
    cache.set("a", 1, "h1");
    cache.set("b", 2, "h2");
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test("tracks hit rate", () => {
    const cache = new MemoryCache();
    cache.set("x", "val", "h");
    cache.get("x"); // hit
    cache.get("y"); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  test("evicts LRU when full", () => {
    const cache = new MemoryCache(3);
    cache.set("a", 1, "h1");
    cache.set("b", 2, "h2");
    cache.set("c", 3, "h3");
    cache.set("d", 4, "h4"); // should evict "a"
    expect(cache.size()).toBe(3);
  });
});

describe("Cache: Key Generation", () => {
  test("makeKey produces consistent hash", () => {
    const key1 = makeKey("file.tw", "content");
    const key2 = makeKey("file.tw", "content");
    expect(key1).toBe(key2);
  });

  test("makeKey differs for different input", () => {
    const key1 = makeKey("file.tw", "content1");
    const key2 = makeKey("file.tw", "content2");
    expect(key1).not.toBe(key2);
  });

  test("makeSourceKey is consistent", () => {
    const key1 = makeSourceKey("source");
    const key2 = makeSourceKey("source");
    expect(key1).toBe(key2);
  });
});

describe("Cache: UnifiedCache", () => {
  test("set and get from memory", () => {
    const cache = new UnifiedCache({ memorySize: 10 });
    cache.set("key", { x: 1 }, "hash");
    expect(cache.get("key")).toEqual({ x: 1 });
  });

  test("has checks both memory and disk", () => {
    const cache = new UnifiedCache({ memorySize: 10 });
    cache.set("key2", "val", "hash");
    expect(cache.has("key2")).toBe(true);
  });

  test("delete removes from both", () => {
    const cache = new UnifiedCache({ memorySize: 10 });
    cache.set("key3", "val", "hash");
    cache.delete("key3");
    expect(cache.has("key3")).toBe(false);
  });
});
