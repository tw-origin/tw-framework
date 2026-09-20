/** tw plugin -- manage project plugins (app-level plugins/ directory). */

import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

/** Parse the `plugins: [...]` array out of tw.config.ts text (cross-runtime,
 *  no import needed -- the file may be TS that node cannot import). */
function readConfigPlugins(cfgPath: string): string[] {
  if (!existsSync(cfgPath)) return [];
  const src = readFileSync(cfgPath, "utf-8");
  const m = /plugins\s*:\s*\[([^\]]*)\]/s.exec(src);
  if (!m) return [];
  const out: string[] = [];
  for (const e of m[1].split(",")) {
    const t = e.trim().replace(/["'`]/g, "");
    // skip object entries (they carry options) -- keep names only
    if (!t || t.startsWith("{")) continue;
    out.push(t);
  }
  return out;
}

/** Add a name to the plugins array in tw.config.ts (creates the array if missing). */
function addConfigPlugin(cfgPath: string, name: string): boolean {
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, `export default {\n  plugins: ["${name}"],\n};\n`);
    return true;
  }
  const src = readFileSync(cfgPath, "utf-8");
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
  const m = /plugins\s*:\s*\[([^\]]*)\]/s.exec(src);
  if (!m) return false;
  const kept = m[1]
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e && e !== `"${name}"` && e !== `'${name}'` && e !== "`" + name + "`");
  writeFileSync(cfgPath, src.replace(m[0], `plugins: [${kept.join(", ")}]`));
  return true;
}

function listPluginFiles(rootDir: string): string[] {
  const dir = join(rootDir, "plugins");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
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
      console.log("  Config is the authority: a listed plugin runs, an unlisted one does not.\n");
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
  version: "1.0.0",
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
      console.log("  Commands:");
      console.log("    list              List plugins/ files and their enabled state");
      console.log("    create <name>     Scaffold a new plugin in plugins/ and enable it");
      console.log("    add <name>        Enable a plugins/ file in tw.config.ts");
      console.log("    remove <name>     Disable a plugin in tw.config.ts\n");
  }
}
