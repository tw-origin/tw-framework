#!/usr/bin/env bash
set -euo pipefail
[ -f AGENTS.md ] || { echo "ERROR: tw-framework repo root se chalao." >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/files"
n=0; while IFS= read -r p; do rel="${p#./}"; mkdir -p "$(dirname "$rel")"; cp "$SRC/$rel" "$rel"; n=$((n+1)); done < <(cd "$SRC" && find . -type f)
echo "wrote $n files"
case "$HERE" in "$PWD"/*) rm -rf "$HERE" ;; esac
echo; echo "Next: git add .github && git commit -m \"ci: honest, idempotent, re-runnable release\" && git push"
