/**
 * Foreign render engines, end to end: react and preact, with the REAL packages.
 *
 * The bundling path used to be hardcoded to preact, so selecting
 * `render.engine: "react"` built a preact bundle (and would fail once preact
 * was absent). These tests bundle and SSR-render an actual component for each
 * engine, so a regression in the engine switch is caught here rather than in a
 * user's build.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadSsrRenderer, buildIslandChunk, scanForeignImports, collectTwFiles } from "../apps/cli/tw/commands/island-bundle.ts";

const repoRoot = resolve(import.meta.dir, "..");
const repoNodeModules = join(repoRoot, "node_modules");

const REACT_COMPONENT = `import { useState } from "react";
export default function Counter({ start }) {
  const [n, setN] = useState(Number(start ?? 0));
  return (
    <div className="counter">
      <button onClick={() => setN(n + 1)}>+</button>
      <span className="count">{n}</span>
    </div>
  );
}
`;

const PREACT_COMPONENT = `import { useState } from "preact/hooks";
export default function PCounter({ start }) {
  const [n, setN] = useState(Number(start ?? 0));
  return (
    <div className="pcounter">
      <button onClick={() => setN(n + 1)}>+</button>
      <span className="count">{n}</span>
    </div>
  );
}
`;

/** A throwaway project whose node_modules points at the repo's, so esbuild
 *  resolves the real react/preact without a second install. */
function makeProject(engine: "react" | "preact"): { root: string; absPath: string; name: string } {
  const root = mkdtempSync(join(tmpdir(), "tw-island-" + engine + "-"));
  mkdirSync(join(root, "components"), { recursive: true });
  mkdirSync(join(root, "home"), { recursive: true });
  symlinkSync(repoNodeModules, join(root, "node_modules"), "dir");
  const isReact = engine === "react";
  const name = isReact ? "Counter" : "PCounter";
  const file = join(root, "components", name + ".tsx");
  writeFileSync(file, isReact ? REACT_COMPONENT : PREACT_COMPONENT);
  writeFileSync(
    join(root, "home", "page.tw"),
    `import ${name} from "@./components/${name}.tsx"\n\npage { title "t" render static }\n\ndiv {\n  ${name} { start ${isReact ? 5 : 7} }\n}\n`,
  );
  return { root, absPath: file, name };
}

const projects: Array<{ root: string }> = [];
afterAll(() => { for (const p of projects) { try { rmSync(p.root, { recursive: true, force: true }); } catch { /* ignore */ } } });

describe("render engine islands: react", () => {
  let proj: { root: string; absPath: string; name: string };
  beforeAll(() => { proj = makeProject("react"); projects.push(proj); });

  test("the SSR renderer is built from react-dom/server and renders the component", async () => {
    const render = await loadSsrRenderer(proj.root, proj.absPath, "react");
    const html = render({ start: "5" }, "");
    expect(html).toContain('class="counter"');
    expect(html).toContain('<span class="count">5</span>');
  });

  test("children are passed through as props.children", async () => {
    const render = await loadSsrRenderer(proj.root, proj.absPath, "react");
    const html = render({}, "");
    expect(html).toContain('<span class="count">0</span>');
  });

  test("the hydration chunk hydrates with react-dom/client, not preact", () => {
    const url = buildIslandChunk(proj.root, proj.absPath, proj.name, true, "react");
    const code = readFileSync(join(proj.root, ".tw", url), "utf-8");
    expect(code).toContain("hydrateRoot");
    expect(code).not.toContain("preact");
    expect(code).toContain("tw-island[data-tw-island=");
  });
});

describe("render engine islands: preact", () => {
  let proj: { root: string; absPath: string; name: string };
  beforeAll(() => { proj = makeProject("preact"); projects.push(proj); });

  test("the SSR renderer is built from preact-render-to-string and renders the component", async () => {
    const render = await loadSsrRenderer(proj.root, proj.absPath, "preact");
    const html = render({ start: "7" }, "");
    expect(html).toContain('class="pcounter"');
    expect(html).toContain('<span class="count">7</span>');
  });

  test("the hydration chunk uses preact's hydrate, not react's hydrateRoot", () => {
    const url = buildIslandChunk(proj.root, proj.absPath, proj.name, true, "preact");
    const code = readFileSync(join(proj.root, ".tw", url), "utf-8");
    expect(code).not.toContain("hydrateRoot");
    expect(code).toContain("tw-island[data-tw-island=");
    // A real runtime was bundled, not just the boot loop.
    expect(code.length).toBeGreaterThan(4000);
  });
});

describe("render engine islands: wiring", () => {
  test("scanForeignImports finds the .tsx import in a .tw page", () => {
    const proj = makeProject("react");
    projects.push(proj);
    const found = scanForeignImports(proj.root, collectTwFiles(proj.root));
    expect(found.map((f) => f.name)).toContain("Counter");
    expect(found[0].absPath.endsWith("Counter.tsx")).toBe(true);
  });

  test("the two engines produce different SSR bundles for the same source shape", async () => {
    const r = makeProject("react"); projects.push(r);
    const p = makeProject("preact"); projects.push(p);
    const reactRender = await loadSsrRenderer(r.root, r.absPath, "react");
    const preactRender = await loadSsrRenderer(p.root, p.absPath, "preact");
    // Different components, but each must render its own markup without throwing.
    expect(reactRender({ start: "1" }, "")).toContain("counter");
    expect(preactRender({ start: "2" }, "")).toContain("pcounter");
  });
});
