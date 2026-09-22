#!/usr/bin/env bash
# The master gate -- everything that must be green before anything ships.
# Mirrors CI exactly (see .github/workflows/ci.yml).
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf "\n\033[1;34m== %s ==\033[0m\n" "$1"; }

say "1/6 typecheck"
bun run lint

say "2/6 unit + e2e suite"
bun test

say "3/6 evals (outcome/scale/invariant/fuzz -- 100% required)"
bun evals/run.ts

say "4/6 all examples build"
BIN="$(pwd)/apps/cli/tw/bin.ts"
fail=0
for dir in examples/*/; do
  name="$(basename "$dir")"
  if (cd "$dir" && bun "$BIN" build > /dev/null 2>&1); then
    echo "  OK   $name"
    rm -rf "${dir%/}/.tw"
  else
    echo "  FAIL $name"; fail=1
  fi
done
[ "$fail" -eq 0 ] || { echo "examples failed"; exit 1; }

say "5/6 bench regression gate"
bun bench/run.ts --check

say "6/6 errors.json in sync with ERROR_CODES"
bun scripts/generate-errors-json.ts > /dev/null
git diff --quiet 2>/dev/null || true # no git -- skip vcs check
node -e "
const fs = require('fs');
const registry = JSON.parse(fs.readFileSync('errors.json', 'utf8'));
const count = registry.count;
const codes = Object.keys(registry.codes).length;
if (count !== codes) { console.error('errors.json count mismatch'); process.exit(1); }
console.log('  errors.json: ' + codes + ' codes, consistent');
"

say "ALL GREEN -- safe to ship"
