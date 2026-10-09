/** tw plugin -- manage project plugins (app-level plugins/ directory). */

import { stripCommentsStringAware, maskSourceStringsAndComments } from "@tw/shared";
import { readPluginSpecs, pluginsArrayRange, splitTopLevel, entryName } from "@tw/plugins";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

/** Parse the `plugins: [...]` array out of tw.config.ts text (cross-runtime,
 *  no import needed -- the file may be TS that node cannot import). */
function readConfigPlugins(cfgPath: string): string[] {
  if (!existsSync(cfgPath)) return [];
  const src = stripCommentsStringAware(readFileSync(cfgPath, "utf-8"));
  // Shared reader: it understands string entries AND object entries
  // ({ name: "x", options: { ... } }) without splitting on their commas.
  return readPluginSpecs(src);
}

/** Add a name to the plugins array in tw.config.ts (creates the array if missing). */
function addConfigPlugin(cfgPath: string, name: string): boolean {
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, `export default {\n  plugins: ["${name}"],\n};\n`);
    return true;
  }
  const src = stripCommentsStringAware(readFileSync(cfgPath, "utf-8"));
  if (new RegExp(`["'\`]${name}["'\`]`).test(src)) return false; // already there
  const m = /plugins\s*:\s*\[([^\]]*)\]/s.exec(src);
  if (m) {
    const inner = m[1].trim();
    const next = inner.length ? `${inner}, "${name}"` : `"${name}"`;
    writeFileSync(cfgPath, src.replace(m[0], `plugins: [${next}]`));
  } else {
    // add the field to the default export object
    const idx = src.lastIndexOf("}");
    if (idx === -1) return false;
    writeFileSync(cfgPath, src.slice(0, idx) + `  plugins: ["${name}"],\n` + src.slice(idx));
  }
  return true;
}

/** Remove a name from the plugins array in tw.config.ts. */
function removeConfigPlugin(cfgPath: string, name: string): boolean {
  if (!existsSync(cfgPath)) return false;
  const src = readFileSync(cfgPath, "utf-8");
  // maskSourceStringsAndComments is SAME-LENGTH (it blanks strings/comments in
  // place), so a range found in the mask is valid against the original source.
  // stripCommentsStringAware removes text and would shift every index.
  const masked = maskSourceStringsAndComments(src);
  const range = pluginsArrayRange(masked);
  if (!range) return false;
  // Read the entries from the ORIGINAL source: the mask blanks string contents,
  // so names would come back empty. The range is still valid because masking
  // preserves length.
  const entries = splitTopLevel(src.slice(range.start, range.end));
  const kept = entries.map((e) => e.trim()).filter((e) => e && entryName(e) !== name);
  if (kept.length === entries.filter((e) => e.trim()).length) return false; // nothing matched
  // Rebuild ONLY the array body; every other plugin entry keeps its options.
  const body = kept.length ? " " + kept.join(", ") + " " : "";
  writeFileSync(cfgPath, src.slice(0, range.start) + body + src.slice(range.end));
  return true;
}

function listPluginFiles(rootDir: string): string[] {
  const dir = join(rootDir, "plugins");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
}

/** Search the npm registry for packages carrying the `tw-plugin` keyword. */
async function searchPlugins(term: string): Promise<void> {
  const q = term ? `keywords:tw-plugin ${term}` : "keywords:tw-plugin";
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=25`;
  console.log(`\n  tw plugin search${term ? ` "${term}"` : ""}  (npm keyword: tw-plugin)\n`);
  let body: any;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`registry returned ${res.status}`);
    body = await res.json();
  } catch (e: any) {
    console.error(`  Could not reach the npm registry: ${e?.message ?? e}`);
    console.error("  Search manually: https://www.npmjs.com/search?q=keywords:tw-plugin\n");
    return;
  }
  const objects: any[] = body?.objects ?? [];
  if (objects.length === 0) {
    console.log("  No plugins found. Publish one with the `tw-plugin` keyword to appear here.\n");
    return;
  }
  for (const o of objects) {
    const p = o.package ?? {};
    const dl = o.downloads?.weekly ? `  ${o.downloads.weekly}/wk` : "";
    const official = String(p.name ?? "").startsWith("@tw/") ? " [official]" : "";
    console.log(`    ${String(p.name ?? "?")}@${p.version ?? "?"}${official}${dl}`);
    if (p.description) console.log(`      ${p.description}`);
  }
  console.log(`\n  Install one with: tw plugin install <package>\n`);
}

/** Install a plugin package with the project's package manager, then enable it. */
async function installPlugin(rootDir: string, pkg: string): Promise<void> {
  const cfgPath = join(rootDir, "tw.config.ts");
  const { detectPackageManager, runInstall } = await import("@tw/shared");
  const manager = detectPackageManager(rootDir).manager;
  console.log(`\n  Installing ${pkg} with ${manager}...`);
  const ok = runInstall(rootDir, manager, [pkg], { stdio: "inherit" });
  if (!ok) {
    console.error(`  Install failed. Run it yourself: ${manager} add ${pkg}\n`);
    process.exit(1);
  }
  // Enable it, keyed by the package name (the resolver loads it from node_modules).
  addConfigPlugin(cfgPath, pkg);
  console.log(`  Installed and enabled: ${pkg}`);
  console.log("  Start the server with Bun: tw serve\n");
}

/** Scaffold a publishable plugin package: tw-plugin-<name>/ ready for npm. */
async function initPluginPackage(rootDir: string, name: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error("Usage: tw plugin init <name>   (lowercase letters, digits, hyphens)");
    process.exit(1);
  }
  const pkgName = name.startsWith("tw-plugin-") ? name : `tw-plugin-${name}`;
  const dir = join(rootDir, pkgName);
  if (existsSync(dir)) {
    console.error(`  Already exists: ${pkgName}/`);
    process.exit(1);
  }
  mkdirSync(join(dir, "src"), { recursive: true });

  const manifest = {
    name: pkgName,
    version: "0.1.0",
    description: "A TW Framework plugin",
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    files: ["dist"],
    // This keyword is what makes the plugin discoverable by `tw plugin search`
    // and any TW plugin directory.
    keywords: ["tw-plugin", "tw-framework"],
    peerDependencies: { "tw-framework": ">=2.0.0" },
    license: "MIT",
  };
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");

  const src = `import type { TWPlugin } from "tw-framework/plugins";

/**
 * ${pkgName} -- one plugin, one job.
 *
 * Published plugins are installed with \`tw plugin install ${pkgName}\` and
 * enabled in tw.config.ts like any other plugin.
 */
const plugin: TWPlugin = {
  name: "${name}",
  version: "0.1.0",
  description: "A TW Framework plugin",
  priority: 50,

  setup(api) {
    // Return a Response to short-circuit, or undefined to pass through.
    api.on("onRequest", (ctx) => {
      if (ctx.url.pathname === "/__${name}") {
        return new Response("hello from ${name}", { headers: { \"content-type\": \"text/plain\" } });
      }
    });
  },
};

export default plugin;
`;
  writeFileSync(join(dir, "src", "index.ts"), src);

  const readme = `# ${pkgName}

A TW Framework plugin.

## Install

\`\`\`bash
tw plugin install ${pkgName}
\`\`\`

That installs it and adds it to \`plugins\` in your \`tw.config.ts\`. Start the
server with Bun (\`tw serve\`) — plugins load as TypeScript modules.

## What it does

Describe the hooks and routes this plugin registers.
`;
  writeFileSync(join(dir, "README.md"), readme);

  const gitignore = "node_modules/\ndist/\n*.log\n";
  writeFileSync(join(dir, ".gitignore"), gitignore);

  console.log(`\n  Created ${pkgName}/`);
  console.log(`    package.json      name + the "tw-plugin" keyword (required for search)`);
  console.log(`    src/index.ts      the plugin`);
  console.log(`    README.md         usage`);
  console.log(`\n  Next:`);
  console.log(`    cd ${pkgName}`);
  console.log("    npm publish          (once the name is free and you are logged in)");
  console.log(`    tw plugin install ${pkgName}   (from a project, to try it)\n`);
}

/** Upgrade the plugins a project depends on. Official by default; --all widens. */
async function upgradePlugins(rootDir: string, opts: { all: boolean; dryRun: boolean }): Promise<void> {
  const cfgPath = join(rootDir, "tw.config.ts");
  if (!existsSync(cfgPath)) {
    console.error("  No tw.config.ts here. Run this from a project root.\n");
    process.exit(1);
  }
  const { readPluginSpecs, planUpgrade, outdated } = await import("@tw/plugins");
  const specs: string[] = readPluginSpecs(readFileSync(cfgPath, "utf-8"));
  if (specs.length === 0) {
    console.log("\n  No plugins in tw.config.ts -- nothing to upgrade.\n");
    return;
  }

  console.log(`\n  tw plugin upgrade${opts.all ? " --all" : ""}${opts.dryRun ? " (dry run)" : ""}\n`);
  const plans = await planUpgrade(specs, { all: opts.all, rootDir });

  for (const p of plans) {
    const label = p.spec.padEnd(30);
    if (p.skipped) { console.log(`    ${label} skipped (${p.skipped})`); continue; }
    if (p.behind) {
      console.log(`    ${label} ${p.installed} -> ${p.latest}   update available`);
    } else {
      console.log(`    ${label} ${p.installed}   up to date`);
    }
  }

  const todo = outdated(plans);
  if (todo.length === 0) {
    const skipped = plans.filter((p) => p.skipped).length;
    console.log(skipped > 0
      ? `\n  Nothing to update. ${skipped} entr${skipped === 1 ? "y" : "ies"} skipped (see above).\n`
      : "\n  Everything is current.\n");
    return;
  }

  if (opts.dryRun) {
    console.log(`\n  ${todo.length} update(s) available. Run without --dry-run to apply.\n`);
    return;
  }

  const { detectPackageManager, runInstall } = await import("@tw/shared");
  const manager = detectPackageManager(rootDir).manager;
  console.log(`\n  Upgrading ${todo.length} plugin(s) with ${manager}...`);
  const ok = runInstall(rootDir, manager, todo.map((p) => `${p.spec}@latest`), { stdio: "inherit" });
  console.log(ok
    ? "  Done. Restart the server (tw serve) to pick up the new versions.\n"
    : "  Some installs failed -- run the command printed above by hand.\n");
  if (!ok) process.exit(1);
}

export async function pluginCommand(): Promise<void> {
  const action = process.argv[3] || "list";
  const rootDir = process.cwd();
  const cfgPath = join(rootDir, "tw.config.ts");

  switch (action) {
    case "list": {
      const enabled = readConfigPlugins(cfgPath);
      const files = listPluginFiles(rootDir);
      console.log("\n  tw plugin -- project plugins\n");
      console.log(`  plugins/ directory: ${files.length === 0 ? "(no plugin files)" : ""}`);
      for (const f of files) {
        const name = f.replace(/\.ts$/, "");
        const on = enabled.includes(name);
        const state = enabled.length > 0
          ? (on ? "enabled" : "disabled (not in tw.config.ts plugins)")
          : "auto-loaded (no plugins field in tw.config.ts)";
        console.log(`    ${name.padEnd(24)} ${state}`);
      }
      if (files.length === 0) {
        console.log("    (create one with: tw plugin create <name>)");
      }
      console.log(`\n  tw.config.ts plugins: [${enabled.map((e) => `"${e}"`).join(", ")}]`);
      console.log("  Config is the authority: a listed plugin runs, an unlisted one does not.");
      console.log("  Shared plugins: tw plugin search | install <pkg> | init <name>\n");
      break;
    }

    case "upgrade": {
      const all = process.argv.includes("--all");
      const dryRun = process.argv.includes("--dry-run");
      await upgradePlugins(rootDir, { all, dryRun });
      break;
    }

    case "init": {
      const name = process.argv[4];
      if (!name) { console.error("Usage: tw plugin init <name>"); process.exit(1); }
      await initPluginPackage(rootDir, name);
      break;
    }

    case "search": {
      await searchPlugins(process.argv[4] ?? "");
      break;
    }

    case "install": {
      const pkg = process.argv[4];
      if (!pkg) { console.error("Usage: tw plugin install <package>"); process.exit(1); }
      await installPlugin(rootDir, pkg);
      break;
    }

    case "add": {
      const name = process.argv[4];
      if (!name) { console.error("Usage: tw plugin add <name>"); process.exit(1); }
      if (!existsSync(join(rootDir, "plugins", `${name}.ts`))) {
        console.error(`  No file plugins/${name}.ts -- create it first: tw plugin create ${name}`);
        process.exit(1);
      }
      const added = addConfigPlugin(cfgPath, name);
      console.log(added ? `  Enabled plugin: ${name} (added to tw.config.ts)` : `  Already enabled: ${name}`);
      break;
    }

    case "remove": {
      const name = process.argv[4];
      if (!name) { console.error("Usage: tw plugin remove <name>"); process.exit(1); }
      const removed = removeConfigPlugin(cfgPath, name);
      console.log(removed ? `  Disabled plugin: ${name} (removed from tw.config.ts)` : `  Was not enabled: ${name}`);
      break;
    }

    case "create": {
      const name = process.argv[4];
      if (!name || !/^[a-z0-9-]+$/.test(name)) {
        console.error("Usage: tw plugin create <name>   (lowercase letters, digits, hyphens)");
        process.exit(1);
      }
      const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const pluginsDir = join(rootDir, "plugins");
      mkdirSync(pluginsDir, { recursive: true });
      const file = join(pluginsDir, `${name}.ts`);
      if (existsSync(file)) {
        console.error(`  Already exists: plugins/${name}.ts`);
        process.exit(1);
      }
      writeFileSync(file, `/** ${name} - TW Framework plugin */

import type { TWPlugin } from "@tw/plugins";

const ${camel}: TWPlugin = {
  name: "${name}",
  version: "2.0.0",
  description: "A TW Framework plugin",

  setup(api) {
    // Hooks: onRequest, onResponse, onError fire on every request.
    api.on("onRequest", (ctx) => {
      // ctx.request, ctx.url
    });

    // Example: register a route the plugin serves itself.
    // api.registerRoute("GET", "/__${name}/health", () => ({ status: 200, json: { ok: true } }));
  },
};

export default ${camel};
`);
      addConfigPlugin(cfgPath, name);
      console.log(`  Created plugins/${name}.ts and enabled it in tw.config.ts`);
      console.log(`  Run \`tw serve\` -- its hooks and routes are live.`);
      break;
    }

    default:
      console.log("\n  Usage: tw plugin <command>\n");
      console.log("  Local plugins (your project):");
      console.log("    list              List plugins/ files and their enabled state");
      console.log("    create <name>     Scaffold a new plugin in plugins/ and enable it");
      console.log("    add <name>        Enable a plugins/ file in tw.config.ts");
      console.log("    remove <name>     Disable a plugin in tw.config.ts\n");
      console.log("  Shared plugins (npm packages):");
      console.log("    init <name>       Scaffold a publishable tw-plugin-<name> package");
      console.log("    search [term]     Find plugins on npm by the tw-plugin keyword");
      console.log("    install <pkg>     Install a plugin package and enable it");
      console.log("    upgrade           Upgrade official plugins (--all, --dry-run)\n");
      console.log("  Publish your own: name it tw-plugin-<x>, add the \"tw-plugin\" keyword,");
      console.log("  npm publish. See docs/plugin-distribution.md.\n");
  }
}
