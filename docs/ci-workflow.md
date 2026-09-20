# TW Framework — CI Workflow

This document covers one thing completely: the GitHub Actions pipeline in `.github/workflows/ci.yml` — what runs on every push and pull request.

---

## Jobs

### Test & Typecheck (Bun)

```yaml
- bun install
- bash scripts/typecheck.sh     # full TypeScript check of all packages
- bun test                     # the complete unit/integration suite
```

The authoritative gate: every test green AND zero type errors.

### Node bundle (Node 20)

```yaml
- bun install
- cd apps/cli && bun scripts/build-node.ts   # build the node distribution
- node apps/cli/dist/tw.mjs --version        # smoke: the bundle actually runs
```

Proves the single-file node build works on a plain Node runtime — the same artifact `tw` ships as (see doc 07).

## What Is NOT in CI

The browser E2E suite (doc 162) and the load test (doc 161) are run locally on demand; they require a browser binary and a live server respectively. CI's contract is: types, tests, node bundle.

## Working With the Pipeline

- **Which branches**: every push and every pull request run the full pipeline — no partial runs.
- **Fail fast**: a red typecheck skips nothing — fix it before reviewing the rest.
- **Runtime pinning**: jobs run on the pinned Bun and Node 20 images; a local green with a different runtime does not override a red pipeline.

## Adding a Step

New checks slot into the existing jobs:

```yaml
- name: Load test (against a served fixture)
  run: |
    bun apps/cli/tw/bin.ts serve --port 8080 &
    sleep 3
    bun scripts/loadtest.ts --url http://localhost:8080 --total 200 --concurrency 10
```

Keep additions self-contained: the workflow must stay green from a clean checkout with no manual setup.

## Local Mirror

Run the same checks the pipeline runs before pushing:

```bash
bash scripts/typecheck.sh
bun test
cd apps/cli && bun scripts/build-node.ts && node dist/tw.mjs --version
```

If these four pass locally, CI will be green — the pipeline contains no environment-specific magic.
