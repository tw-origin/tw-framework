---
description: Cut a TW Framework release (version, verify, zip, fresh-verify)
allowed-tools: Bash(bun *), Read(**), Write(**)
---
# /release

Execute the release process from contributing/release-process.md. No step
is optional; the order is not advisory.

## 1. Pick the version

Semver. The 1.0.x line has used patch releases for feature batches by
convention (1.0.5 hardening, 1.0.6 cache layer) -- keep that convention
unless the user explicitly asks for a minor/major.

## 2. Bump exactly THREE files

- `apps/cli/package.json`
- `apps/create-tw-framework/package.json`
- `packages/compiler/tw/codegen/version.ts` (the generator meta)

Then PROVE it: build any example and check that the output carries
`<meta name="generator" content="TW Framework X.Y.Z">` with the new
number. If the meta does not match the package.json version, stop -- one
of the three files was missed.

## 3. The master gate

`bun run verify` -- all of it, green: typecheck, 2702 tests, 322 evals at
100%, all 30 example builds, bench --check, errors.json sync. ~3m20s.
Paste the final "ALL GREEN" line in the report.

## 4. Clean and zip

```sh
rm -rf examples/*/.tw
zip -qr tw-framework-X.Y.Z.zip . -x "*node_modules*" -x "*/.tw/*" -x "tsconfig.check.json"
```

## 5. Fresh-verify (THE step that gets skipped -- never here)

```sh
rm -rf /tmp/relcheck && mkdir -p /tmp/relcheck/tw-framework
unzip -q tw-framework-X.Y.Z.zip -d /tmp/relcheck/tw-framework
cd /tmp/relcheck/tw-framework && bun install && bun test && bun evals/run.ts
```

The zip contents must pass, not the working tree. A zip that was never
unzipped is untested.

## 6. Report

Deliver: the zip path, the test/eval/bench summaries from BOTH the working
tree and the fresh-verify, and a changelog. Breaking changes (there should
be none on this line) need an UPGRADING.md section.
