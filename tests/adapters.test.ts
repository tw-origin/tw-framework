import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { generateAdapter, listAdapters, ADAPTERS } from "@tw/adapters";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("deployment adapters", () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("registry lists all 15 adapters", () => {
    const names = listAdapters().map((a) => a.name).sort();
    expect(names).toEqual([
      "bun", "caddy", "cloudflare", "digitalocean", "docker",
      "firebase", "fly", "github-pages", "netlify", "nginx",
      "node", "railway", "render", "vercel", "aws",
    ].sort());
  });

  test("unknown adapter throws with available names", () => {
    let msg = "";
    try { generateAdapter("nope", tmpdir()); } catch (e: any) { msg = e.message; }
    expect(msg).toContain("node");
    expect(msg).toContain("docker");
  });

  test("node adapter writes zero-dep server.mjs", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("node", d);
    expect(written.length).toBe(1);
    expect(written[0]).toBe(join(d, "server.mjs"));
    const src = readFileSync(written[0], "utf-8");
    // zero-dependency: only node: imports
    expect(src).toContain("node:http");
    expect(/^import .*from "(?!node:)/m.test(src)).toBe(false);
    // security blocklist present
    expect(src).toContain("twm");
    expect(src).toContain("nosniff");
  });

  test("bun adapter imports TWServer", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("bun", d);
    const src = readFileSync(written[0], "utf-8");
    expect(src).toContain("@tw/server");
    expect(src).toContain("server.start()");
  });

  test("docker adapter writes full + static Dockerfiles, compose, server", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("docker", d).map((p) => p.split("/").pop());
    expect(written.sort()).toEqual([".dockerignore", "Dockerfile", "Dockerfile.static", "docker-compose.yml", "server.mjs"]);
    const full = readFileSync(join(d, "Dockerfile"), "utf-8");
    expect(full).toContain("bunx tw build");
    expect(full).toContain("bunx\", \"tw\", \"serve");
    const stat = readFileSync(join(d, "Dockerfile.static"), "utf-8");
    expect(stat).toContain("node:20-alpine");
    expect(stat).toContain("node\", \"server.mjs");
    const di = readFileSync(join(d, ".dockerignore"), "utf-8");
    expect(di).toContain("node_modules");
    expect(di).toContain(".env");
  });

  test("vercel adapter writes valid json config", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("vercel", d);
    const cfg = JSON.parse(readFileSync(join(d, "vercel.json"), "utf-8"));
    expect(cfg.outputDirectory).toBe(".tw");
    expect(cfg.buildCommand).toContain("tw build");
  });

  test("netlify adapter writes toml build config", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("netlify", d);
    const src = readFileSync(join(d, "netlify.toml"), "utf-8");
    expect(src).toContain('command = "tw build"');
    expect(src).toContain('publish = ".tw"');
    expect(src).toContain("immutable");
  });

  test("cloudflare adapter writes wrangler + headers + redirects", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("cloudflare", d).map((p) => p.split("/").pop());
    expect(written.sort()).toEqual(["_headers", "_redirects", "wrangler.toml"]);
    const wr = readFileSync(join(d, "wrangler.toml"), "utf-8");
    expect(wr).toContain('pages_build_output_dir = ".tw"');
    const headers = readFileSync(join(d, "_headers"), "utf-8");
    expect(headers).toContain("immutable");
  });

  test("aws adapter writes s3 deploy script and readme", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("aws", d).map((p) => p.split("/").pop());
    expect(written.sort()).toEqual(["AWS-DEPLOY.md", "deploy-s3.sh"]);
    const sh = readFileSync(join(d, "deploy-s3.sh"), "utf-8");
    expect(sh).toContain("aws s3 sync");
    expect(sh).toContain("cloudfront create-invalidation");
    expect(sh).toContain("immutable");
  });

  test("digitalocean adapter writes app spec under .do/", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("digitalocean", d);
    expect(written[0]).toBe(join(d, ".do", "app.yaml"));
    const src = readFileSync(written[0], "utf-8");
    expect(src).toContain("static_sites");
    expect(src).toContain("output_dir: .tw");
  });

  test("render adapter writes blueprint yaml", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("render", d);
    const src = readFileSync(join(d, "render.yaml"), "utf-8");
    expect(src).toContain("services:");
    expect(src).toContain("staticPublishPath: .tw");
  });

  test("railway adapter writes container config", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("railway", d);
    const src = readFileSync(join(d, "railway.toml"), "utf-8");
    expect(src).toContain('builder = "DOCKERFILE"');
    expect(src).toContain('startCommand = "tw serve"');
  });

  test("fly adapter writes machine config on port 8000", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("fly", d);
    const src = readFileSync(join(d, "fly.toml"), "utf-8");
    expect(src).toContain("internal_port = 8000");
    expect(src).toContain("[http_service]");
  });

  test("github-pages adapter writes workflow + .nojekyll", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    const written = generateAdapter("github-pages", d);
    expect(written.some((p) => p.endsWith(".nojekyll"))).toBe(true);
    const wf = readFileSync(join(d, ".github", "workflows", "deploy.yml"), "utf-8");
    expect(wf).toContain("bunx tw build");
    expect(wf).toContain("actions/deploy-pages@v4");
  });

  test("firebase adapter writes valid strict json hosting config", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("firebase", d);
    const cfg = JSON.parse(readFileSync(join(d, "firebase.json"), "utf-8"));
    expect(cfg.hosting.public).toBe(".tw");
    expect(cfg.hosting.cleanUrls).toBe(true);
  });

  test("nginx and caddy adapters write self-host configs", () => {
    const d = mkdtempSync(join(tmpdir(), "tw-adap-"));
    dirs.push(d);
    generateAdapter("nginx", d);
    generateAdapter("caddy", d);
    const ngx = readFileSync(join(d, "nginx.conf"), "utf-8");
    expect(ngx).toContain("try_files");
    expect(ngx).toContain("immutable");
    const caddy = readFileSync(join(d, "Caddyfile"), "utf-8");
    expect(caddy).toContain("file_server");
    expect(caddy).toContain("root * .tw");
  });

  test("every adapter has next steps", () => {
    for (const a of listAdapters()) {
      expect(a.nextSteps.length).toBeGreaterThan(0);
      expect(a.files.length).toBeGreaterThan(0);
    }
  });
});
