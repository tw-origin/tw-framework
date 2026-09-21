#!/usr/bin/env bash
# TW Framework v1.0.4 release script
# Kaise chalana hai (Termux me):
#   1. Ye file chat se download karo (phone ki Downloads me aayegi)
#   2. Termux me: cp /sdcard/Download/v104-fix.sh ~/tw-framework/
#   3. cd ~/tw-framework && bash v104-fix.sh
set -e
cd "$(dirname "$0")"

if [ ! -f apps/cli/package.json ]; then
  echo "!! ERROR: ye script tw-framework repo ke andar honi chahiye (apps/cli/package.json nahi mila)"
  exit 1
fi

echo "=== TW Framework v1.0.4 fix script ==="
echo ""

node << 'EOF'
const fs = require("fs");
const { execSync } = require("child_process");

function sh(cmd, okToFail) {
  try { const r = execSync(cmd, { stdio: "pipe" }).toString().trim(); console.log("OK  " + cmd); return r; }
  catch (e) { if (okToFail) { console.log("--  " + cmd + " (skip)"); return ""; } console.log("!! FAIL: " + cmd + "\n" + e.message); process.exit(1); }
}

function patch(path, pairs) {
  let s = fs.readFileSync(path, "utf8");
  let n = 0;
  for (const [o, x] of pairs) {
    if (s.includes(x)) continue;
    if (!s.includes(o)) { console.log("!! ANCHOR MISSING in " + path + ":\n" + o.slice(0, 80)); process.exit(1); }
    s = s.replace(o, x); n++;
  }
  if (n) fs.writeFileSync(path, s);
  console.log((n ? "FIXED x" + n : "already ok") + " <- " + path);
}

// ---- 1. dev.ts: /__tw_runtime.js npm package path fix ----
patch("apps/cli/tw/commands/dev.ts", [[
`        const runtimePath = _bd
          ? resolve(_bd, "../../..", "packages/runtime/tw/client/hydration-runtime.js")
          : resolve(_srcDir, "../../../..", "packages/runtime/tw/client/hydration-runtime.js");
        if (existsSync(runtimePath)) {
          return new Response(readFileSync(runtimePath, "utf-8"), {
            headers: { "Content-Type": "application/javascript; charset=utf-8" },
          });
        }
        return new Response("// runtime not found", { status: 404 });`,
`        // Bundled (npm) CLI ships the runtime next to tw.mjs as
        // dist/hydration-runtime.js (same resolution as build.ts).
        // Source run keeps the repo-relative path.
        const runtimeCandidates = _bd
          ? [resolve(_bd, "hydration-runtime.js"), resolve(_srcDir, "../../../..", "packages/runtime/tw/client/hydration-runtime.js")]
          : [resolve(_srcDir, "../../../..", "packages/runtime/tw/client/hydration-runtime.js")];
        for (const runtimePath of runtimeCandidates) {
          if (existsSync(runtimePath)) {
            return new Response(readFileSync(runtimePath, "utf-8"), {
              headers: { "Content-Type": "application/javascript; charset=utf-8" },
            });
          }
        }
        return new Response("// runtime not found", { status: 404 });`
]]);

// ---- 2. index.ts: dynamic --version ----
patch("apps/cli/tw/commands/index.ts", [[
'import { parseArgs, colors } from "../args";\n\nconst VERSION = "1.0.0";',
'import { parseArgs, colors } from "../args";\nimport { readFileSync } from "node:fs";\nimport { join } from "node:path";\n\n// Read the version from package.json at runtime so it never drifts from\n// the published version (bundled CLI: dist/../package.json, source: ../../package.json).\nconst VERSION = (() => {\n  try {\n    const bd = (globalThis as any).__TW_BUNDLE_DIR as string | undefined;\n    const pj = bd ? join(bd, "..", "package.json") : new URL("../../package.json", import.meta.url).pathname;\n    return (JSON.parse(readFileSync(pj, "utf-8")).version as string) ?? "0.0.0";\n  } catch {\n    return "0.0.0";\n  }\n})();'
]]);

// ---- 3. generator meta version ----
patch("packages/compiler/tw/codegen/version.ts", [[
'export const TW_VERSION = "1.0.3";',
'export const TW_VERSION = "1.0.4";'
]]);

// ---- 4. package versions ----
for (const q of ["apps/cli/package.json", "apps/create-tw-framework/package.json"]) {
  let s = fs.readFileSync(q, "utf8");
  if (!s.includes('"version": "1.0.4"')) {
    if (!s.includes('"version": "1.0.3"')) { console.log("!! " + q + " me 1.0.3 nahi mila:\n" + s.slice(0, 200)); process.exit(1); }
    fs.writeFileSync(q, s.replace('"version": "1.0.3"', '"version": "1.0.4"'));
    console.log("FIXED <- " + q + " (1.0.4)");
  } else console.log("already ok <- " + q);
}

// ---- 5. VERIFY ----
const checks = [
  ["apps/cli/package.json", '"1.0.4"', "package.json version"],
  ["apps/cli/tw/commands/dev.ts", "runtimeCandidates", "dev.ts runtime fix"],
  ["apps/cli/tw/commands/index.ts", "readFileSync(pj", "dynamic version"],
  ["packages/compiler/tw/codegen/version.ts", '"1.0.4"', "generator meta"],
];
for (const [f, needle, name] of checks) {
  if (!fs.readFileSync(f, "utf8").includes(needle)) { console.log("!! VERIFY FAIL: " + name); process.exit(1); }
}
console.log("");
console.log("=== SAB PATCHES VERIFY PASS ===");
console.log("");

// ---- 6. purana galat tag hatao ----
sh("git tag -d v1.0.4", true);
sh("git push origin :refs/tags/v1.0.4", true);

// ---- 7. commit + push main ----
const st = sh("git status --porcelain");
if (st) {
  sh("git add -A");
  sh('git commit -m "v1.0.4: fix tw dev 404 on /__tw_runtime.js (npm package path) + dynamic --version"');
  sh("git push origin main");
  console.log("");
  console.log("=== COMMIT PUSH HO GAYA ===");
  console.log("");
} else {
  console.log("changes nahi milte — pehle se committed hone ka check");
  sh("git push origin main", true);
}

// ---- 8. final verify + tag ----
const log = sh("git log --oneline -1");
console.log("HEAD: " + log);
if (!log.includes("v1.0.4")) { console.log("!! HEAD v1.0.4 commit nahi hai — RUK GAYE, tag nahi banega"); process.exit(1); }
sh("git tag v1.0.4");
sh("git push origin v1.0.4");
console.log("");
console.log("=== TAG v1.0.4 PUSHED ===");
console.log("GitHub Actions ab khud publish karega (~1 min).");
console.log("Phir check: npm view tw-framework versions  ->  1.0.4 dikhna chahiye");
EOF

echo ""
echo "=== SCRIPT COMPLETE ==="
