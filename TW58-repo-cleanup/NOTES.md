# Repo audit — files that should not be there

## Removed by this pack (clearly accidental)

| Path | Files | Size | What it is |
|------|-------|------|------------|
| `TW-release-2.0.0/` | 5 | 500 KB | a leftover pack folder: a copy of `CHANGELOG.md`, a copy of `RELEASE-NOTES-v2.0.0.md`, `release.sh`, `assets/SHA256SUMS`, and a **488 KB tarball** (`tw-framework-2.0.0.tgz`) |
| `TW-release-workflow-fix/` | 3 | 8 KB | a leftover pack folder: `RELEASE-FIX.md`, `apply.sh`, and a copy of `.github/workflows/release.yml` |
| `dist-release/` | 2 | 487 KB | build output: `SHA256SUMS` and a **486 KB tarball** (`tw-framework-2.0.0.tgz`) |

`.gitignore` also gains `dist-release`, `TW-release-*` and `*-pack/` so they cannot
come back.

## Your call (not touched — each has a trade-off)

**`apps/cli/dist/`** — 2.2 MB of build output is tracked (`dist/tw.mjs` 1.8 MB,
`dist/tw-runtime-client.mjs` 407 KB), even though `dist` is in `.gitignore`, so it
was force-added at some point. `apps/cli/package.json` needs it (`main` and `bin`
point into `dist/`, and `files: ["dist"]`), but the release workflow rebuilds it
(`bun scripts/build-node.ts`) before publishing, so keeping it in git only means it
drifts from the source. To remove:

```
git rm -r --cached apps/cli/dist && rm -rf apps/cli/dist
```

**`release.sh`** (repo root) — hardcodes v2.0.0 (`[ "$VER" = "2.0.0" ]`, `git tag -a
v2.0.0`) and is referenced nowhere. The CI workflow does releases now. Either
delete it or update it to read the version from `package.json`:

```
git rm release.sh
```

**`.agents/` and `.cursor/`** — agent/tooling config (`README.md`, `skills.json`,
`rules/tw.mdc`). Intentional or not is your call; `.claude-plugin/` and `skills/`
look deliberate, these two less so.

**`assets/logo.jpg`** — 862 KB for a single logo next to a 217 KB `assets/brand/logo.png`.
Probably compressible.

## What is fine

`assets/brand/*` (README images), `rust/`, `evals/`, `bench/`, `skills/`,
`contributing/`, `errors.json`, `bun.lock`, `tw.config.ts` — all referenced or
deliberate. No `.env`, keys or credentials are tracked, and `node_modules` is not
tracked.
