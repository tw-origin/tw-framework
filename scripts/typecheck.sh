#!/usr/bin/env bash
# Per-package type check (a single full-repo tsc run exhausts memory).
# Usage: bun run lint
set -u
cd "$(dirname "$0")/.."
total=0
for g in packages/shared packages/compiler packages/runtime packages/server \
         packages/lsp packages/plugins \
         packages/security packages/sdk packages/adapters packages/image apps; do
  printf '{"extends":"./tsconfig.json","include":["%s/**/*"]}' "$g" > tsconfig.check.json
  n=$(NODE_OPTIONS="--max-old-space-size=2048" ./node_modules/.bin/tsc -p tsconfig.check.json 2>&1 | grep -c "error TS" || true)
  rm -f tsconfig.check.json
  printf "%-22s %s errors\n" "$g" "$n"
  total=$((total + n))
done
printf "%-22s %s errors\n" "TOTAL" "$total"
exit $([ "$total" -gt 0 ] && echo 1 || echo 0)
