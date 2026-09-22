---
name: release
description: Cut a TW Framework release -- version, master gate, zip, fresh-verify, changelog
version: 1.0.6
---

# Skill: release

A release is a claim: "this artifact, unzipped anywhere, passes
everything." The process exists to make the claim true.

## 1. Version

Semver; the 1.0.x line uses patch releases for feature batches (1.0.5
hardening, 1.0.6 cache layer) -- follow the convention unless told
otherwise. THREE files carry the number:

- apps/cli/package.json
- apps/create-tw-framework/package.json
- packages/compiler/tw/codegen/version.ts (generator meta)

PROVE the bump: build any example and check `<meta name="generator">`
shows the new version. A mismatch means a file was missed -- stop.

## 2. Master gate

```sh
bun run verify
```

Typecheck -> 2702 tests -> 322 evals -> every example builds -> bench
--check -> errors.json sync. ~3m20s. All green or no release. Paste the
ALL GREEN line in the release report.

## 3. Clean and zip

```sh
rm -rf examples/*/.tw          # build artifacts never ship
zip -qr tw-framework-X.Y.Z.zip . -x "*node_modules*" -x "*/.tw/*" -x "tsconfig.check.json"
```

## 4. Fresh-verify (the non-negotiable step)

```sh
rm -rf /tmp/relcheck && mkdir -p /tmp/relcheck/tw-framework
unzip -q tw-framework-X.Y.Z.zip -d /tmp/relcheck/tw-framework
cd /tmp/relcheck/tw-framework
bun install
bun test && bun evals/run.ts
```

The ZIP must pass, not the working tree. Every prior release of this
framework has done this; skipping it once is how a broken artifact ships.

## 5. Changelog and notes

Summarize what changed since the last release (the version history lives
in UPGRADING.md -- extend it). Zero-breaking-change releases say so
explicitly; anything else needs an UPGRADING.md migration section.

## Failure modes

1. Meta/version mismatch -- one of the three files missed.
2. Examples fail from the zip but pass in the tree -- a build artifact
   or an absolute path leaked in; re-clean and re-zip.
3. Bench fails only on the release run -- re-run once (pod noise), then
   treat as real.
