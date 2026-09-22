#!/usr/bin/env node
// Wrapper: eval harness (compiler + agent evals). 100% required.
import { spawnSync } from "node:child_process";
const r = spawnSync("bun", ["evals/run.ts"], { stdio: "inherit" });
process.exit(r.status ?? 1);
