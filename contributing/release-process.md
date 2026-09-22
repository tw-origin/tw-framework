# Release Process -- From Version Bump to Fresh-Verified Artifact

This document covers one thing completely: cutting a TW Framework
release -- the versioning, the gates, the artifact, and the verification
that makes "released" a meaningful word.

## 1. Version

Three files, no more, no less:

- `apps/cli/package.json`
- `apps/create-tw-framework/package.json`
- `packages/compiler/tw/codegen/version.ts`

Semver on the 1.0.x line: patch releases for feature batches (1.0.5 was
a 50-bug hardening batch; 1.0.6 was the cache layer + the test
infrastructure). Keep the convention unless told otherwise.

**Proof step**: build any example; the output must contain
`<meta name="generator" content="TW Framework X.Y.Z">` matching the
package version. Mismatch = a file was missed = stop.

## 2. The master gate

```sh
bun run verify
```

Steps it runs, in order: typecheck (11 packages) -> the full suite
(2702) -> the eval harness (322) -> every example builds (14) -> the
bench regression gate (6 metrics) -> errors.json sync. About 3m20s.
Green or no release. The final ALL GREEN line goes in the release notes.

## 3. Clean and zip

```sh
rm -rf examples/*/.tw
zip -qr tw-framework-X.Y.Z.zip . \\
  -x "*node_modules*" -x "*/.tw/*" -x "tsconfig.check.json"
```

Build artifacts never ship. The zip is source only (~2.8MB for 1.0.6).

## 4. Fresh-verify (the step this document exists to protect)

```sh
rm -rf /tmp/relcheck && mkdir -p /tmp/relcheck/tw-framework
unzip -q tw-framework-X.Y.Z.zip -d /tmp/relcheck/tw-framework
cd /tmp/relcheck/tw-framework
bun install
bun test && bun evals/run.ts
```

The artifact passes, not the working tree. Every release in this line has
been fresh-verified; the one that skips it will be the one that ships a
missing file.

## 5. Changelog

Extend UPGRADING.md (the per-version migration story) and summarize in
the release notes: what changed, how it was verified, and the zero-
breaking-change statement (or the migration steps). The notes carry the
same evidence bar as a PR -- commands and outputs, not adjectives.

## Failure modes

| Symptom | Meaning |
|---|---|
| Meta mismatch after bump | one of the three files missed |
| Zip fails, tree passes | artifact leak or absolute path -- re-clean |
| Bench fails once | pod noise -- re-run; twice means real |
| Example builds in tree but not zip | a dependency on working-tree state -- find it |
