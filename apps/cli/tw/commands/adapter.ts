/** tw adapter <name> — generate deployment adapter files into the app. */

import { join, resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";

export async function adapterCommand(): Promise<void> {
  const args = process.argv.slice(3);
  const rootDir = process.cwd();

  // Locate the adapters package: node_modules/@tw/adapters (symlinked in dev,
  // bundled into dist/tw.mjs in the published CLI).
  const candidates = [
    resolve(rootDir, "node_modules", "@tw", "adapters", "tw", "index.ts"),
    resolve(rootDir, "node_modules", "@tw", "adapters", "tw", "index.js"),
  ];
  let adaptersMod: any = null;
  let via = "";
  for (const c of candidates) {
    if (existsSync(c)) {
      adaptersMod = await import(c);
      via = c;
      break;
    }
  }
  if (!adaptersMod) {
    try {
      adaptersMod = await import("@tw/adapters");
      via = "@tw/adapters";
    } catch {
      adaptersMod = null;
    }
  }

  if (!adaptersMod) {
    console.log("\n  tw adapter — deployment adapters\n");
    console.log("  Adapters package (@tw/adapters) not found.");
    console.log("  Install the framework: bun add tw-framework  (or use the monorepo).\n");
    process.exit(1);
  }

  const list = adaptersMod.listAdapters();

  if (args.length === 0 || args[0] === "list" || args[0] === "--help" || args[0] === "-h") {
    console.log("\n  tw adapter <name> — generate deployment adapter files\n");
    for (const a of list) {
      console.log(`    ${a.name.padEnd(8)} ${a.description}`);
      console.log(`    ${"".padEnd(8)} files: ${a.files.map((f: any) => f.to).join(", ")}`);
    }
    console.log("");
    return;
  }

  const name = args[0];
  if (!adaptersMod.ADAPTERS?.[name]) {
    console.log(`  Unknown adapter "${name}". Available: ${list.map((a: any) => a.name).join(", ")}\n`);
    process.exit(1);
  }

  // An adapter that cannot run a server silently drops every .twm API route:
  // `tw build` reports "APIs: 1 routes", then GET /api/ping answers 404 from
  // the generated server. Say so before the files are written.
  const STATIC_ONLY = new Set([
    "node", "deno", "cloudflare", "netlify", "github-pages", "firebase",
    "aws", "digitalocean", "render", "nginx", "caddy", "vercel", "static",
  ]);
  if (STATIC_ONLY.has(name)) {
    const apiRoots = [join(rootDir, ".tw", "api"), join(rootDir, "api")];
    let apiCount = 0;
    const countTwm = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) countTwm(full);
        else if (entry.name === "route.twm") apiCount++;
      }
    };
    for (const r of apiRoots) countTwm(r);
    if (apiCount > 0) {
      console.log("\n  ! " + apiCount + " API route" + (apiCount === 1 ? "" : "s") + " will not be served by the " + name + " adapter.");
      console.log("    It packages the static build only, so every .twm route answers 404.");
      console.log("    Use `tw adapter bun` (or the Dockerfile) if the APIs must run.\n");
    }
  }

  const written = adaptersMod.generateAdapter(name, rootDir);
  console.log(`\n  ${via ? "" : ""}Generated ${name} adapter:\n`);
  for (const w of written) console.log("    OK " + w.replace(rootDir + "/", ""));
  console.log("\n  Next steps:");
  for (const s of adaptersMod.ADAPTERS[name].nextSteps) console.log("    $ " + s);
  console.log("");
}
