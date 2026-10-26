#!/usr/bin/env bash
# Removes three directories that were committed by accident, and keeps them out.
set -euo pipefail
[ -f AGENTS.md ] || { echo "ERROR: tw-framework repo root se chalao." >&2; exit 1; }

for d in TW-release-2.0.0 TW-release-workflow-fix dist-release; do
  if [ -d "$d" ]; then
    git rm -r --quiet --cached "$d" 2>/dev/null || true
    rm -rf "$d"
    echo "removed $d"
  else
    echo "already gone: $d"
  fi
done

# keep build output and pack folders out of git from now on
if ! grep -qx 'dist-release' .gitignore; then
  printf 'dist-release\nTW-release-*\n*-pack/\n' >> .gitignore
  echo "gitignore updated"
else
  echo "gitignore already updated"
fi

echo
echo "Now review and commit:"
echo "  git status --short"
echo "  git add -A && git commit -m \"chore: remove accidentally committed pack and build folders\""
