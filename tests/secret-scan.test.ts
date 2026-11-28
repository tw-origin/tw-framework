import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanSourceForSecrets, scanBundleForSecrets, overlapsDenylist,
  SERVER_ONLY_HINTS, AWS_PAIR_MAX_DISTANCE,
} from "../apps/cli/tw/commands/secret-scan.ts";
import { DEFAULT_DENY_PACKAGES } from "../apps/cli/tw/commands/server-boundary.ts";

// Fixtures are built at run time and deleted afterwards, so no real-looking
// secret literal is ever committed (GitHub secret scanning would flag it).

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tw-sec-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

// A literal is assembled from parts so the source of THIS file carries no
// scannable key, but the file written to disk does.
const lit = (...parts: string[]) => parts.join("");
const AWS_ID = lit("AKIA", "IOSFODNN7EXAMPLQ");
const AWS_SECRET = lit("wJalrXUtnFEMI/K7MDENG/bPxRfiCY", "EXAMPLQKEY");
const STRIPE = lit("sk_", "live_", "abcdefghijklmnop1234");
const GH = lit("gh", "p_", "abcdefghijklmnopqrstuvwxyz0123");
const JWT = lit("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", ".", "abcdefghijklmnop");
const PK = lit("-----BEGIN ", "RSA PRIVATE KEY-----");

describe("TW311 — confirmed shapes", () => {
  test("a private key block is reported", () => {
    const f = scanSourceForSecrets(`const k = "${PK}";`, "a.ts");
    expect(f.some((x) => x.code === "TW311")).toBe(true);
  });

  test("AWS key id + secret together is reported", () => {
    const src = `const id = "${AWS_ID}";\nconst secret = "${AWS_SECRET}";`;
    expect(scanSourceForSecrets(src, "a.ts").some((x) => x.code === "TW311")).toBe(true);
  });

  test("AWS docs example values are not reported", () => {
    const src = `const id = "${lit("AKIA", "IOSFODNN7EXAMPLE")}";\nconst s = "${lit("wJalrXUtnFEMI/K7MDENG/bPxRfiCY", "EXAMPLEKEY")}";`;
    expect(scanSourceForSecrets(src, "a.ts").filter((x) => x.code === "TW311")).toEqual([]);
  });

  test("the pair is not reported beyond the distance limit", () => {
    const pad = "x".repeat(AWS_PAIR_MAX_DISTANCE * 2);
    const src = `const id = "${AWS_ID}";\n// ${pad}\nconst s = "${AWS_SECRET}";`;
    expect(scanSourceForSecrets(src, "a.ts").filter((x) => x.code === "TW311")).toEqual([]);
  });
});

describe("TW312 / TW313 — suspicious", () => {
  test("live-looking keys are reported and redacted", () => {
    const f = scanSourceForSecrets(`const a = "${STRIPE}";\nconst b = "${GH}";\nconst c = "${JWT}";`, "a.ts");
    expect(f.filter((x) => x.code === "TW312").length).toBe(3);
    for (const x of f) expect(x.message).not.toContain("abcdefghijklmnop");
  });

  test("a secret-named export holding a literal is reported", () => {
    const f = scanSourceForSecrets(`export const STRIPE_SECRET_KEY = "${STRIPE}";`, "a.ts");
    expect(f.some((x) => x.code === "TW313")).toBe(true);
  });

  test("placeholders are never reported", () => {
    const src = [
      `export const API_KEY = "YOUR_API_KEY";`,
      `export const OTHER = "changeme";`,
      `export const X = "";`,
      `export const Y = "xxxxxxxxxxxx";`,
      `export const W = "<YOUR_KEY_HERE>";`,
    ].join("\n");
    expect(scanSourceForSecrets(src, "a.ts")).toEqual([]);
  });
});

describe("TW314 — server-only env var", () => {
  test("a secret-named env read is reported", () => {
    expect(scanSourceForSecrets(`const k = process.env.JWT_SECRET;`, "a.ts").some((x) => x.code === "TW314")).toBe(true);
  });

  test("PUBLIC_* is not reported", () => {
    for (const name of ["PUBLIC_API_URL", "NEXT_PUBLIC_KEY", "VITE_TOKEN", "EXPO_PUBLIC_SECRET"]) {
      expect(scanSourceForSecrets(`const k = process.env.${name};`, "a.ts").filter((x) => x.code === "TW314")).toEqual([]);
    }
  });

  test("a non-secret name is not reported", () => {
    expect(scanSourceForSecrets(`const p = process.env.PORT;`, "a.ts").filter((x) => x.code === "TW314")).toEqual([]);
  });
});

describe("TW315 — server-only package", () => {
  test("a hint package is reported", () => {
    expect(scanSourceForSecrets(`import Stripe from "stripe";`, "a.ts").some((x) => x.code === "TW315")).toBe(true);
  });

  test("the hint list and the TW1007 denylist do not overlap", () => {
    expect(overlapsDenylist(DEFAULT_DENY_PACKAGES)).toEqual([]);
  });

  test("a denylisted package is NOT reported by TW315 (it is TW1007's job)", () => {
    expect(scanSourceForSecrets(`import pg from "pg";`, "a.ts").filter((x) => x.code === "TW315")).toEqual([]);
  });
});

describe("TW316 — the client-safe marker stays a promise", () => {
  test("marker plus a secret shape is reported, and says it cannot verify", () => {
    const src = `import "@tw/client-safe";\nexport const K = "${STRIPE}";`;
    const f = scanSourceForSecrets(src, "a.ts").find((x) => x.code === "TW316");
    expect(f).toBeDefined();
    expect(f!.message).toContain("cannot verify");
  });

  test("the marker alone is not reported", () => {
    expect(scanSourceForSecrets(`import "@tw/client-safe";\nexport const ok = 1;`, "a.ts").filter((x) => x.code === "TW316")).toEqual([]);
  });
});

describe("TW317 — exact match in the emitted bundle", () => {
  test("a real secret value in the bundle is reported by NAME only", () => {
    const value = lit("s3cr3t", "Value", "12345");
    const bundle = `var x="${value}";`;
    const f = scanBundleForSecrets(bundle, [{ name: "JWT_SECRET", value }]);
    expect(f.length).toBe(1);
    expect(f[0].code).toBe("TW317");
    expect(f[0].message).toContain("JWT_SECRET");
    expect(f[0].message).not.toContain(value);
  });

  test("a value not in the bundle is not reported", () => {
    expect(scanBundleForSecrets("var x=1;", [{ name: "JWT_SECRET", value: lit("other", "Value", "999") }])).toEqual([]);
  });
});

describe("line and column point at the original file", () => {
  test("a finding below a server block keeps its real line number", async () => {
    const { compileSync, stripServerBlockRegions, collectServerBlocks } = await import("../packages/compiler/tw/index.ts");
    const page = [
      'page { title "x" render static }',
      "server {",
      "  const a = 1;",
      "  const b = 2;",
      "}",
      `div { p "${STRIPE}" }`,
    ].join("\n");
    const dir = fixture({ "home/page.tw": page });
    const raw = readFileSync(join(dir, "home/page.tw"), "utf-8");
    const parsed: any = compileSync(raw, { filePath: join(dir, "home/page.tw") });
    const blanked = stripServerBlockRegions(raw, collectServerBlocks(parsed.ast));
    // same number of lines, so positions still match
    expect(blanked.split("\n").length).toBe(raw.split("\n").length);
    const f = scanSourceForSecrets(blanked, "home/page.tw");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].line).toBe(6);
  });

  test("a secret inside a server block is not reported", async () => {
    const { compileSync, stripServerBlockRegions, collectServerBlocks } = await import("../packages/compiler/tw/index.ts");
    const page = [
      'page { title "x" render ssr }',
      "server {",
      `  const key = "${STRIPE}";`,
      "  const k2 = process.env.JWT_SECRET;",
      "}",
      'div { p "clean" }',
    ].join("\n");
    const dir = fixture({ "home/page.tw": page });
    const raw = readFileSync(join(dir, "home/page.tw"), "utf-8");
    const parsed: any = compileSync(raw, { filePath: join(dir, "home/page.tw") });
    const blanked = stripServerBlockRegions(raw, collectServerBlocks(parsed.ast));
    expect(scanSourceForSecrets(blanked, "home/page.tw")).toEqual([]);
  });
});

describe("plain modules are scanned too", () => {
  test("a .ts module with a secret is reported", () => {
    const dir = fixture({ "lib/config.ts": `export const GH = "${GH}";` });
    const src = readFileSync(join(dir, "lib/config.ts"), "utf-8");
    expect(scanSourceForSecrets(src, "lib/config.ts").some((x) => x.code === "TW312")).toBe(true);
  });

  test("a .js module with a secret is reported", () => {
    const dir = fixture({ "lib/config.js": `module.exports = { k: "${JWT}" };` });
    const src = readFileSync(join(dir, "lib/config.js"), "utf-8");
    expect(scanSourceForSecrets(src, "lib/config.js").some((x) => x.code === "TW312")).toBe(true);
  });
});
