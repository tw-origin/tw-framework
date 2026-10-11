#!/usr/bin/env bash
# TW-server-blocks-fixes -- guarded file copy. Run from the tw-framework repo root.
set -euo pipefail
if [ ! -f AGENTS.md ] || [ ! -f package.json ] || [ ! -d packages/compiler ]; then
  echo "ERROR: run this from the tw-framework repo root." >&2; exit 1
fi
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/files"
[ -d "$SRC" ] || { echo "ERROR: 'files/' missing next to apply.sh." >&2; exit 1; }
count=0
while IFS= read -r p; do rel="${p#./}"; mkdir -p "$(dirname "$rel")"; cp "$SRC/$rel" "$rel"; count=$((count+1)); done < <(cd "$SRC" && find . -type f)
echo "wrote $count files"
