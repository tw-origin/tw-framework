import { describe, test, expect } from "bun:test";
import { detectPackageManager, resolvePackageManager, installArgs, installAllArgs, execArgs, runScriptArgs, commandLine } from "../packages/shared/tw/config/package-manager.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmp(): string { return mkdtempSync(join(tmpdir(), "tw-pm-")); }

describe("package manager: detection", () => {
  test("defaults to npm when there is nothing to go on", () => {
    const dir = tmp();
    try { const i = detectPackageManager(dir); expect(i.manager).toBe("npm"); expect(i.source).toBe("default"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("each lockfile names its manager", () => {
    for (const [file, manager] of [["package-lock.json","npm"],["pnpm-lock.yaml","pnpm"],["yarn.lock","yarn"],["bun.lockb","bun"],["bun.lock","bun"]] as Array<[string,string]>) {
      const dir = tmp();
      try { writeFileSync(join(dir, file), ""); const i = detectPackageManager(dir); expect(i.manager).toBe(manager); expect(i.source).toBe("lockfile"); }
      finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
  test("the packageManager field (corepack) wins over the lockfile", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "yarn.lock"), "");
      writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@9.1.0" }));
      const i = detectPackageManager(dir);
      expect(i.manager).toBe("pnpm"); expect(i.source).toBe("packageManager-field");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("an unreadable package.json does not crash detection", () => {
    const dir = tmp();
    try { writeFileSync(join(dir, "package.json"), "{ not json"); writeFileSync(join(dir, "pnpm-lock.yaml"), ""); expect(detectPackageManager(dir).manager).toBe("pnpm"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("package manager: resolution", () => {
  test("an explicit strategy overrides detection", () => {
    const dir = tmp();
    try { writeFileSync(join(dir, "pnpm-lock.yaml"), ""); const i = resolvePackageManager(dir, { packages: { manager: "yarn" } }); expect(i.manager).toBe("yarn"); expect(i.source).toBe("config"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("auto falls back to detection", () => {
    const dir = tmp();
    try { writeFileSync(join(dir, "bun.lockb"), ""); expect(resolvePackageManager(dir, { packages: { manager: "auto" } }).manager).toBe("bun"); expect(resolvePackageManager(dir, undefined).manager).toBe("bun"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("package manager: commands", () => {
  test("dev and runtime installs differ only by the dev flag", () => {
    expect(installArgs("npm", ["preact"], { dev: true })).toEqual({ cmd: "npm", args: ["install", "-D", "preact"] });
    expect(installArgs("npm", ["preact"])).toEqual({ cmd: "npm", args: ["install", "preact"] });
    expect(installArgs("bun", ["preact"], { dev: true })).toEqual({ cmd: "bun", args: ["add", "-d", "preact"] });
    expect(installArgs("pnpm", ["preact"], { dev: true })).toEqual({ cmd: "pnpm", args: ["add", "-D", "preact"] });
    expect(installArgs("yarn", ["preact"], { dev: true })).toEqual({ cmd: "yarn", args: ["add", "-D", "preact"] });
  });
  test("installAll has a per-manager form", () => {
    expect(installAllArgs("npm").args).toContain("--no-audit");
    expect(installAllArgs("bun")).toEqual({ cmd: "bun", args: ["install"] });
    expect(installAllArgs("pnpm")).toEqual({ cmd: "pnpm", args: ["install"] });
  });
  test("running a binary without installing it globally", () => {
    expect(execArgs("npm", "tw", ["build"])).toEqual({ cmd: "npx", args: ["tw", "build"] });
    expect(execArgs("bun", "tw", ["build"])).toEqual({ cmd: "bunx", args: ["tw", "build"] });
    expect(execArgs("pnpm", "tw", ["build"])).toEqual({ cmd: "pnpm", args: ["dlx", "tw", "build"] });
    expect(execArgs("yarn", "tw", ["build"])).toEqual({ cmd: "yarn", args: ["dlx", "tw", "build"] });
  });
  test("running a package.json script", () => {
    expect(runScriptArgs("npm", "dev")).toEqual({ cmd: "npm", args: ["run", "dev"] });
    expect(runScriptArgs("bun", "dev")).toEqual({ cmd: "bun", args: ["run", "dev"] });
    expect(runScriptArgs("pnpm", "dev")).toEqual({ cmd: "pnpm", args: ["dev"] });
    expect(runScriptArgs("yarn", "dev")).toEqual({ cmd: "yarn", args: ["dev"] });
  });
  test("commandLine renders a copy-pasteable string", () => {
    expect(commandLine(installArgs("npm", ["preact"], { dev: true }))).toBe("npm install -D preact");
    expect(commandLine({ cmd: "bun", args: [] })).toBe("bun");
  });
});
