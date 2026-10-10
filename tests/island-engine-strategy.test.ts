/**
 * Island engines and hydration timing.
 *
 * Two things the framework gained on top of the plain engine switch:
 *
 *   1. The engine is read from each component's OWN imports, so one project can
 *      mix React and Preact components. `render.engine` is only the fallback for
 *      a component that imports neither.
 *   2. `@client:*` on a component decides WHEN it hydrates -- eagerly (default),
 *      when the browser is idle, or when the island scrolls into view. `@server`
 *      ships no JavaScript at all.
 *
 * The detection has one real trap: `preact` contains `react`, so an unanchored
 * match classifies every Preact component as React. That is pinned below.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  detectEngine,
  parseClientStrategy,
  buildIslandChunk,
  loadSsrRenderer,
  scanForeignImports,
  collectTwFiles,
} from "../apps/cli/tw/commands/island-bundle.ts";

const repoNodeModules = join(resolve(import.meta.dir, ".."), "node_modules");

describe("detectEngine: read from the component's own imports", () => {
  test("react", () => {
    expect(detectEngine(`import { useState } from "react";`, "preact")).toBe("react");
  });

  test("react-dom/client", () => {
    expect(detectEngine(`import { createRoot } from "react-dom/client";`, "preact")).toBe("react");
  });

  test("preact", () => {
    expect(detectEngine(`import { h } from "preact";`, "react")).toBe("preact");
  });

  test("preact/hooks", () => {
    expect(detectEngine(`import { useState } from "preact/hooks";`, "react")).toBe("preact");
  });

  test("the trap: preact must NOT be read as react", () => {
    // "preact" contains "react"; an unanchored match gets this wrong.
    expect(detectEngine(`import { h } from "preact";`, "react")).toBe("preact");
    expect(detectEngine(`import x from "preact/compat";`, "react")).toBe("preact");
  });

  test("require() form", () => {
    expect(detectEngine(`const r = require("react");`, "preact")).toBe("react");
    expect(detectEngine(`const p = require("preact");`, "react")).toBe("preact");
  });

  test("a component with neither falls back to the configured engine", () => {
    expect(detectEngine(`export default function X() { return null; }`, "preact")).toBe("preact");
    expect(detectEngine(``, "react")).toBe("react");
  });
});

describe("parseClientStrategy: when an island hydrates", () => {
  test("default is eager", () => {
    expect(parseClientStrategy(`export default function X() {}`)).toEqual({ kind: "client", strategy: "eager" });
  });

  test("@client is eager", () => {
    expect(parseClientStrategy(`// @client\nexport default function X() {}`).strategy).toBe("eager");
  });

  test("@client:eager is eager", () => {
    expect(parseClientStrategy(`// @client:eager\nexport default function X() {}`).strategy).toBe("eager");
  });

  test("@client:lazy hydrates on idle", () => {
    expect(parseClientStrategy(`// @client:lazy\nexport default function X() {}`).strategy).toBe("lazy");
  });

  test("@client:visible hydrates on visibility", () => {
    expect(parseClientStrategy(`// @client:visible\nexport default function X() {}`).strategy).toBe("visible");
  });

  test("@server ships no JavaScript", () => {
    expect(parseClientStrategy(`// @server\nexport default function X() {}`).kind).toBe("server");
  });

  test("the specific directives win over the bare @client", () => {
    // @client:visible contains @client; the specific one must be checked first.
    expect(parseClientStrategy(`// @client\n// @client:visible`).strategy).toBe("visible");
    expect(parseClientStrategy(`// @client\n// @client:lazy`).strategy).toBe("lazy");
  });
});

describe("buildIslandChunk: the strategy reaches the emitted JavaScript", () => {
  let proj: { root: string; absPath: string };

  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), "tw-island-strategy-"));
    mkdirSync(join(root, "components"), { recursive: true });
    symlinkSync(repoNodeModules, join(root, "node_modules"), "dir");
    const file = join(root, "components", "Counter.tsx");
    writeFileSync(file, `import { useState } from "react";\nexport default function Counter() { const [n] = useState(0); return <div>{n}</div>; }\n`);
    proj = { root, absPath: file };
  });

  afterAll(() => { try { rmSync(proj.root, { recursive: true, force: true }); } catch { /* ignore */ } });

  function chunkFor(strategy: "eager" | "lazy" | "visible"): string {
    const url = buildIslandChunk(proj.root, proj.absPath, "Counter", true, "react", strategy);
    return readFileSync(join(proj.root, ".tw", url), "utf-8");
  }

  test("eager boots on DOMContentLoaded", () => {
    const code = chunkFor("eager");
    expect(code).toContain("DOMContentLoaded");
    expect(code).not.toContain("requestIdleCallback");
    expect(code).not.toContain("IntersectionObserver");
  });

  test("lazy uses requestIdleCallback with a setTimeout fallback", () => {
    const code = chunkFor("lazy");
    expect(code).toContain("requestIdleCallback");
    expect(code).toContain("setTimeout");
    expect(code).not.toContain("IntersectionObserver");
  });

  test("visible uses IntersectionObserver", () => {
    const code = chunkFor("visible");
    expect(code).toContain("IntersectionObserver");
    expect(code).toContain("isIntersecting");
    expect(code).not.toContain("requestIdleCallback");
  });

  test("each strategy produces its own chunk", () => {
    const a = buildIslandChunk(proj.root, proj.absPath, "Counter", true, "react", "eager");
    const b = buildIslandChunk(proj.root, proj.absPath, "Counter", true, "react", "lazy");
    const c = buildIslandChunk(proj.root, proj.absPath, "Counter", true, "react", "visible");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test("every chunk still hydrates the island", () => {
    for (const s of ["eager", "lazy", "visible"] as const) {
      expect(chunkFor(s)).toContain("data-tw-island");
    }
  });
});

describe("mixing React and Preact in one project", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tw-island-mix-"));
    mkdirSync(join(root, "components"), { recursive: true });
    mkdirSync(join(root, "home"), { recursive: true });
    symlinkSync(repoNodeModules, join(root, "node_modules"), "dir");
    writeFileSync(
      join(root, "components", "RCounter.tsx"),
      `import { useState } from "react";\nexport default function RCounter({ start }) { const [n, setN] = useState(Number(start ?? 0)); return <button onClick={() => setN(n + 1)}>{n}</button>; }\n`,
    );
    writeFileSync(
      join(root, "components", "PCounter.tsx"),
      `// @client:visible\nimport { useState } from "preact/hooks";\nexport default function PCounter({ start }) { const [n, setN] = useState(Number(start ?? 0)); return <button onClick={() => setN(n + 1)}>{n}</button>; }\n`,
    );
    writeFileSync(
      join(root, "home", "page.tw"),
      `import RCounter from "@./components/RCounter.tsx"\nimport PCounter from "@./components/PCounter.tsx"\n\npage { title "mix" render static }\n\ndiv {\n  RCounter { start 1 }\n  PCounter { start 2 }\n}\n`,
    );
  });

  afterAll(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  test("both components are found", () => {
    const foreign = scanForeignImports(root, collectTwFiles(root));
    expect(foreign.map((f) => f.name).sort()).toEqual(["PCounter", "RCounter"]);
  });

  test("each is assigned its own engine", () => {
    const foreign = scanForeignImports(root, collectTwFiles(root));
    const byName = new Map(foreign.map((f) => [f.name, f]));
    const rSrc = readFileSync(byName.get("RCounter")!.absPath, "utf-8");
    const pSrc = readFileSync(byName.get("PCounter")!.absPath, "utf-8");
    // One configured engine, two components, two different engines resolved.
    expect(detectEngine(rSrc, "preact")).toBe("react");
    expect(detectEngine(pSrc, "preact")).toBe("preact");
  });

  test("the Preact component's directive is read", () => {
    const foreign = scanForeignImports(root, collectTwFiles(root));
    const p = foreign.find((f) => f.name === "PCounter")!;
    expect(parseClientStrategy(readFileSync(p.absPath, "utf-8")).strategy).toBe("visible");
  });

  test("both render through their own engine", async () => {
    const foreign = scanForeignImports(root, collectTwFiles(root));
    const r = foreign.find((f) => f.name === "RCounter")!;
    const p = foreign.find((f) => f.name === "PCounter")!;
    const rRender = await loadSsrRenderer(root, r.absPath, "react");
    const pRender = await loadSsrRenderer(root, p.absPath, "preact");
    expect(rRender({ start: "1" }, "")).toContain(">1<");
    expect(pRender({ start: "2" }, "")).toContain(">2<");
  });
});
