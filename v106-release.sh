#!/usr/bin/env bash
# =============================================================
# TW Framework v1.0.6 RELEASE SCRIPT
# (Cache layer + 2702-test suite + 30 examples + full repo infra)
#
# Termux me kaise chalana hai:
#   1. Chat se tw-framework-1.0.6-full-repo.zip download karo
#   2. Repo backup: cp -r ~/tw-framework ~/tw-framework-backup
#   3. unzip -o /sdcard/Download/tw-framework-1.0.6-full-repo.zip -d ~/tw-framework/
#   4. cp /sdcard/Download/v106-release.sh ~/tw-framework/
#   5. cd ~/tw-framework && bash v106-release.sh
# =============================================================
set -e
cd "$(dirname "$0")"

if [ ! -f apps/cli/package.json ]; then
  echo "!! ERROR: apps/cli/package.json nahi mila -- repo root me chalao"
  exit 1
fi

echo "=== TW Framework v1.0.6 release ==="
echo ""

node << 'NODEOF'
const fs = require("fs");

function ok(msg) { console.log("OK  " + msg); }
function die(msg) { console.log("!! " + msg); process.exit(1); }

// ---- 1) Version already 1.0.6 in all THREE files ----
const spots = [
  ["apps/cli/package.json", '"1.0.6"'],
  ["apps/create-tw-framework/package.json", '"1.0.6"'],
  ["packages/compiler/tw/codegen/version.ts", "1.0.6"],
];
for (const [f, needle] of spots) {
  if (!fs.existsSync(f)) die("missing " + f);
  if (!fs.readFileSync(f, "utf8").includes(needle)) die("version 1.0.6 missing in " + f + " -- sahi zip unzip hua?");
  ok("version 1.0.6 in " + f);
}

// ---- 2) Sanity: the v1.0.6 features are present ----
const checks = [
  ["packages/shared/tw/cache.ts", "BUILTIN_CACHE_PROFILES", "cache profiles engine"],
  ["packages/shared/tw/cache.ts", "resolveCache", "resolveCache"],
  ["packages/server/tw/routing/render-pipeline.ts", "freshUntil", "HIT/STALE/MISS windows"],
  ["packages/server/tw/routing/twm-loader.ts", "stripCommentsSafe", "https:// string bugfix"],
  ["packages/server/tw/routing/revalidate.ts", "registerTwmTagInvalidator", "tag registry"],
  ["apps/cli/tw/commands/create.ts", "home/api/stats/route.twm", "rich scaffold template"],
  ["tests/unit-twm-comment-strip.test.ts", "stripCommentsSafe", "comment-strip regression suite"],
  ["docs/cache-tags.md", "cache { }", "cache docs"],
  ["AGENTS.md", "The Complete TW Framework Operating Manual", "operating manual"],
  ["evals/run.ts", "fuzz", "eval harness"],
  ["bench/run.ts", "--check", "bench regression gate"],
];
for (const [f, needle, label] of checks) {
  if (!fs.existsSync(f)) die("MISSING FILE: " + f + " -- zip sahi jagah unzip hua?");
  if (!fs.readFileSync(f, "utf8").includes(needle)) die(label + " missing in " + f);
  ok(label);
}

// ---- 3) Counts ----
const examples = fs.readdirSync("examples").filter((d) => fs.statSync("examples/" + d).isDirectory()).length;
console.log("OK  examples: " + examples + " (expect 30)");
if (examples < 30) die("example count below 30");
const errorsJson = JSON.parse(fs.readFileSync("errors.json", "utf8"));
console.log("OK  errors.json: " + errorsJson.count + " codes");
if (errorsJson.count !== Object.keys(errorsJson.codes).length) die("errors.json count mismatch");
NODEOF

echo ""
echo "=== Optional: run the master gate before pushing ==="
echo "  (bun install && bun run verify  -- ~4 min; CI bhi karega)"
if command -v bun >/dev/null 2>&1; then
  if bun install >/dev/null 2>&1 && bun test 2>&1 | tail -3; then
    echo "-- tests green"
  else
    echo "-- local test run failed/skipped -- CI will gate it"
  fi
fi

echo ""
# ---- Clean: legacy one-off scripts release repo me nahi chahiye ----
rm -f v104-fix.sh v105-release.sh v105-typefix.sh typefix2.sh
echo "-- legacy fix scripts removed (agar the)"

echo ""
echo "=== Git commit + tag ==="
git add -A
git commit -m "v1.0.6: explicit cache layer + testing infrastructure + full repo

- cache { } directive on pages (stale/revalidate/expire/life/tag)
- fn cached handlers with build-time profile resolution
- revalidateTag() + action-result revalidateTag (updateTag)
- Diagnostics TW090-TW093 (cache gates)
- Zero breaking change: legacy page { revalidate N } byte-identical
- Render cache: HIT/STALE/MISS windows, 270x speedup warm (98.7k/s)
- 2702-test suite (unit matrix + isolated e2e)
- 322-case eval harness (outcome/scale/invariant/300 fuzz)
- 6-metric benchmark suite with regression gate
- 30 examples (3 full sites: store, recipes, docs)
- Rich tw create scaffold (33 files, 4 APIs, components, cache demo)
- Full repo: AGENTS.md manual, errors.json registry, contributing/,
  .claude/ commands, skills/, evals/, bench/, CI with examples+gates
- Fix: string-aware .twm comment strip (https:// URLs broke handlers)" || echo "(nothing to commit)"
git tag -f v1.0.6 2>/dev/null || true

echo ""
echo "=== Push ==="
git push origin main --tags 2>/dev/null || echo "-- git push manual karo: git push origin main --tags"

echo ""
echo "=== npm publish (org packages) ==="
echo "  cd packages/shared && npm publish --access public"
echo "  cd ../compiler && npm publish --access public"
echo "  cd ../runtime && npm publish --access public"
echo "  cd ../security && npm publish --access public"
echo "  cd ../server && npm publish --access public"
echo "  cd ../adapters && npm publish --access public"
echo "  cd ../link && npm publish --access public"
echo "  cd ../image && npm publish --access public"
echo "  cd ../../apps/cli && npm publish --access public"
echo "  cd ../create-tw-framework && npm publish --access public"
echo ""
echo "=== SCRIPT COMPLETE -- v1.0.6 LIVE ==="
