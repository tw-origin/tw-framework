/**
 * v1.0.7 regression round — the string-aware scanner fixes:
 *
 *   1. maskSourceStringsAndComments: same-length source masking.
 *   2. extractRenderMode / extractCacheDirective / revalidate window:
 *      directive words inside quoted strings or comments must be ignored.
 *   3. interpolate: `\{` escapes a literal brace instead of starting
 *      interpolation (raw-text escape for docs-style pages).
 */
import { describe, expect, test } from "bun:test";

const shared = async () => (await import("../packages/shared/tw/index.ts")) as any;

// --- 1. source masking --------------------------------------------------------

describe("maskSourceStringsAndComments", () => {
  test("blanks double-quoted strings, keeps the rest", async () => {
    const { maskSourceStringsAndComments } = await shared();
    const src = `page { title "render ssr" render static }`;
    const out = maskSourceStringsAndComments(src);
    expect(out).toHaveLength(src.length);
    expect(out).not.toContain("render ssr");
    expect(out).toContain("render static");
  });

  test("blanks single-quoted strings and template literals", async () => {
    const { maskSourceStringsAndComments } = await shared();
    const src = `a "x" b 'y' c \`z\` d`;
    const out = maskSourceStringsAndComments(src);
    expect(out).toHaveLength(src.length);
    expect(out).not.toContain("x"); // the string contents disappear
    expect(out).not.toContain("y");
    expect(out).not.toContain("z");
    expect(out).toContain("a");
    expect(out).toContain("d");
  });

  test("honors escaped quotes inside strings", async () => {
    const { maskSourceStringsAndComments } = await shared();
    // the \\" quotes are escaped, so the string runs to the LAST quote:
    // everything inside (revalidate 60, ok) is masked.
    const src = `p "say \\" revalidate 60 \\" ok"`;
    const out = maskSourceStringsAndComments(src);
    expect(out).toHaveLength(src.length);
    expect(out).not.toContain("revalidate");
    expect(out).not.toContain("ok");
    // a real token after the string survives
    const src2 = `p "say \\" no \\"" div { render static }`;
    expect(maskSourceStringsAndComments(src2)).toContain("render static");
  });

  test("blanks line and block comments", async () => {
    const { maskSourceStringsAndComments } = await shared();
    const src = `// revalidate 60\npage { title "t" } /* cache { revalidate 30 } */ div { "x" }`;
    const out = maskSourceStringsAndComments(src);
    expect(out).not.toContain("revalidate");
    expect(out).toContain(`page { title`);
    expect(out).toContain(`div {`);
    expect(out).toHaveLength(src.length);
  });

  test("keeps newlines so line numbers stay accurate", async () => {
    const { maskSourceStringsAndComments } = await shared();
    const src = `// a\n// b\npage { title "x" }`;
    const out = maskSourceStringsAndComments(src);
    expect(out.split("\n")).toHaveLength(3);
  });
});

// --- 2. string-aware directive scanning --------------------------------------

describe("string-aware directive scanning", () => {
  test("extractCacheDirective ignores `cache { }` shown inside a string", async () => {
    const { extractCacheDirective } = await shared();
    const src = [
      `page { title "ISR docs" render static }`,
      ``,
      `p "Set page { cache { revalidate 60 } } to enable ISR."`,
    ].join("\n");
    expect(extractCacheDirective(src)).toBeNull();
  });

  test("extractCacheDirective still finds a real cache block", async () => {
    const { extractCacheDirective } = await shared();
    const src = `page {\n  title "Shop"\n  cache { life "product", tag "products" }\n}\ndiv { "x" }`;
    const meta = extractCacheDirective(src);
    expect(meta).not.toBeNull();
    expect(meta.life).toBe("product");
    expect(meta.tag).toBe("products");
  });

  test("extractRenderMode ignores mode words inside strings (build.ts)", async () => {
    const { extractRenderMode } = (await import("../apps/cli/tw/commands/build.ts")) as any;
    // docs page that SHOWS `render ssr` as example text
    const src = `page { title "render modes" render static }\np "Use page { render ssr } for server rendering."`;
    expect(extractRenderMode(src)).toBe("static");
    // the real directive still wins
    const real = `page { title "x" render ssr }`;
    expect(extractRenderMode(real)).toBe("ssr");
  });

  test("revalidate window regex ignores `revalidate N` inside strings", async () => {
    const { maskSourceStringsAndComments } = await shared();
    const re = /page\s*\{[^}]*revalidate\s+(\d+)/;
    // before the fix this raw page would have matched through the string
    const src = `page { title "ISR docs" render static }\np "Add page { revalidate 60 } for ISR."`;
    expect(re.exec(maskSourceStringsAndComments(src))).toBeNull();
    // a real directive still matches
    const real = `page { title "x" revalidate 60 }`;
    const m = re.exec(maskSourceStringsAndComments(real));
    expect(m).not.toBeNull();
    expect(m![1]).toBe("60");
  });
});

// --- 3. interpolation escape --------------------------------------------------

describe("interpolate brace escape", () => {
  test("\\{ renders a literal brace, never interpolates", async () => {
    const { interpolate } = await import("../packages/compiler/tw/eval/interpolate.ts");
    expect(interpolate(`a \\{ b`, {})).toBe("a { b");
    expect(interpolate(`\\{retries: 3\\}`, {})).toBe("{retries: 3}");
    // unaffected: normal interpolation
    expect(interpolate("hi {name}", { name: "tw" })).toBe("hi tw");
    expect(interpolate("hi {{name}}", { name: "tw" })).toBe("hi tw");
    // escaped brace next to real interpolation
    expect(interpolate(`\\{ {name} \\}`, { name: "tw" })).toBe("{ tw }");
    // a lone backslash elsewhere still passes through raw
    expect(interpolate(`C:\\path {name}`, { name: "x" })).toBe("C:\\path x");
  });
});
