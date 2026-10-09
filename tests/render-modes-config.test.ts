import { describe, test, expect } from "bun:test";
import {
  RENDER_MODE_ALIASES, RENDER_MODE_NAMES, VALID_RENDER_MODES, VALID_RUNTIME_TARGETS,
  resolveRenderMode,
} from "@tw/shared";

describe("render modes: one source of truth", () => {
  test("there are 7 render modes, and edge is not one", () => {
    expect(RENDER_MODE_NAMES).toHaveLength(7);
    expect(RENDER_MODE_NAMES).toEqual(["static", "ssr", "island", "csr", "stream", "ppr", "signalStream"]);
    expect(VALID_RENDER_MODES.has("edge" as any)).toBe(false);
  });

  test("every canonical name resolves to itself", () => {
    for (const m of RENDER_MODE_NAMES) {
      const r = resolveRenderMode(m);
      expect(r?.mode).toBe(m);
      expect(r?.aliased).toBe(false);
    }
  });

  test("the aliases map where they should", () => {
    expect(resolveRenderMode("ssg")?.mode).toBe("static");
    expect(resolveRenderMode("server")?.mode).toBe("ssr");
    expect(resolveRenderMode("client")?.mode).toBe("csr");
    expect(resolveRenderMode("interactive")?.mode).toBe("island");
  });

  test("edge still works, and resolves to ssr on the edge target", () => {
    const r = resolveRenderMode("edge");
    expect(r?.mode).toBe("ssr");
    expect(r?.target).toBe("edge");
    expect(r?.aliased).toBe(true);
  });

  test("the modes the validator used to reject are now accepted", () => {
    // these were in the union but missing from the parser's hardcoded list
    for (const m of ["stream", "ppr", "signalStream"]) {
      expect(resolveRenderMode(m)?.mode).toBe(m);
    }
  });

  test("case, quotes and whitespace are tolerated", () => {
    expect(resolveRenderMode("  'SSR'  ")?.mode).toBe("ssr");
    expect(resolveRenderMode('"Static"')?.mode).toBe("static");
  });

  test("nonsense resolves to null, never a wrong mode", () => {
    for (const bad of ["", "   ", "banana", "edgy", "static-ish"]) {
      expect(resolveRenderMode(bad)).toBeNull();
    }
  });

  test("runtime targets are a separate list", () => {
    expect(VALID_RUNTIME_TARGETS.has("edge")).toBe(true);
    expect(VALID_RUNTIME_TARGETS.has("node")).toBe(true);
    expect(VALID_RUNTIME_TARGETS.size).toBe(5);
  });

  test("the alias table covers every canonical mode", () => {
    const covered = new Set(Object.values(RENDER_MODE_ALIASES));
    for (const m of RENDER_MODE_NAMES) expect(covered.has(m)).toBe(true);
  });
});

describe("the config carries no redundant restatement", () => {
  test("no renderModes: the framework already knows the valid modes", async () => {
    const { createDefaultConfig } = await import("@tw/shared");
    const cfg: any = createDefaultConfig("/tmp/x");
    // A page declares its own mode; the set of valid modes is the framework's.
    // A config list of them only restated that and changed no behaviour.
    expect(cfg.router.renderModes).toBeUndefined();
  });

  test("no pageExtensions: the extension is decided by the file type", async () => {
    const { createDefaultConfig } = await import("@tw/shared");
    const cfg: any = createDefaultConfig("/tmp/x");
    expect(cfg.router.pageExtensions).toBeUndefined();
  });

  test("no duplicate runtime.target alongside strategies.runtime", async () => {
    const { createDefaultConfig } = await import("@tw/shared");
    const cfg: any = createDefaultConfig("/tmp/x");
    expect(cfg.runtime).toBeUndefined();
  });

  test("no mode / baseDir: routing is filesystem and home/ is the convention", async () => {
    const { createDefaultConfig } = await import("@tw/shared");
    const cfg: any = createDefaultConfig("/tmp/x");
    // The router IS filesystem-based -- there is no other mode to pick, and
    // `code`/`hybrid` were never implemented. `home/` is the convention, the
    // same way Next fixes `app/`; the build hardcodes it. Both fields were
    // written by the scaffold and read by nothing.
    expect(cfg.router.mode).toBeUndefined();
    expect(cfg.router.baseDir).toBeUndefined();
  });
});

describe("a page is markup: .tw only", () => {
  test(".twm is the server-side module extension, not a page one", async () => {
    const shared: any = await import("@tw/shared");
    // the framework's own mapping
    expect(shared.getExtensionForType("page")).toBe(".tw");
    expect(shared.getExtensionForType("layout")).toBe(".tw");
    expect(shared.getExtensionForType("route")).toBe(".twm");
    expect(shared.getExtensionForType("middleware")).toBe(".twm");
    // and a page is a UI file, a route is not
    expect(shared.isInteractiveFile("page")).toBe(true);
    expect(shared.isInteractiveFile("route")).toBe(false);
    expect(shared.isApiRoute("route")).toBe(true);
  });
});
