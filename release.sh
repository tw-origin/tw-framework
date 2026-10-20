#!/usr/bin/env bash
# TW Framework v2.0.0 release.
#   ./release.sh                -- verify + tag + pack (nothing is pushed)
#   ./release.sh --skip-tests   -- same, but skip the local test suite
#   ./release.sh --publish      -- also push the tag, create the GitHub release
#                                  and publish to npm
set -euo pipefail
[ -f AGENTS.md ] || { echo "run from the tw-framework repo root"; exit 1; }
PUBLISH=0; SKIP_TESTS=0
for a in "$@"; do
  case "$a" in
    --publish) PUBLISH=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *) echo "unknown flag: $a"; exit 1 ;;
  esac
done

VER=$(node -e "console.log(require('./package.json').version)")
CLIVER=$(node -e "console.log(require('./apps/cli/package.json').version)")
echo "root=$VER cli=$CLIVER"
[ "$VER" = "2.0.0" ] && [ "$CLIVER" = "2.0.0" ] || { echo "version is not 2.0.0 -- bump package.json first"; exit 1; }

echo "==> typecheck"
bash scripts/typecheck.sh

if [ "$SKIP_TESTS" = "1" ]; then
  echo "==> tests skipped (--skip-tests)"
else
  echo "==> tests"
  set +e
  bun test > /tmp/tw-test.log 2>&1
  RC=$?
  set -e
  if [ "$RC" -eq 0 ]; then
    tail -3 /tmp/tw-test.log
  elif grep -q "@happy-dom/global-registrator" /tmp/tw-test.log; then
    # This device cannot run the suite: `bun install` did not lay down
    # @happy-dom/global-registrator, so every test file errors before it starts.
    # The typecheck above still ran; CI is the gate for the test suite.
    echo
    echo "  [!] The local test runner is unavailable on this device"
    echo "      (@happy-dom/global-registrator is missing, so every test file errors)."
    echo "      Make sure the latest main is green in CI, then re-run with:"
    echo "          ./release.sh --skip-tests $([ "$PUBLISH" = 1 ] && echo --publish)"
    exit 1
  else
    echo "  [!] tests failed:"
    tail -30 /tmp/tw-test.log
    exit 1
  fi
fi

echo "==> build + pack the npm artifact"
rm -rf dist-release && mkdir -p dist-release
( cd apps/cli && npm pack --pack-destination "$OLDPWD/dist-release" )
( cd dist-release && sha256sum *.tgz > SHA256SUMS && cat SHA256SUMS )

echo "==> git tag"
git tag -a v2.0.0 -m "TW Framework v2.0.0" 2>/dev/null || echo "tag v2.0.0 already exists"

if [ "$PUBLISH" = "1" ]; then
  command -v gh >/dev/null || { echo "gh is not installed -- run: pkg install gh"; exit 1; }
  echo "==> push tag"
  git push origin v2.0.0
  echo "==> GitHub release"
  gh release create v2.0.0 \
    --title "TW Framework v2.0.0" \
    --notes-file RELEASE-NOTES-v2.0.0.md \
    dist-release/tw-framework-2.0.0.tgz dist-release/SHA256SUMS
  echo "==> npm publish"
  bun run scripts/publish-all.ts --publish
else
  echo
  echo "dry run complete -- nothing pushed. To release:"
  echo "  ./release.sh --skip-tests --publish     # (on a device that cannot run bun test)"
  echo "  ./release.sh --publish                  # (on a device where bun test passes)"
fi
