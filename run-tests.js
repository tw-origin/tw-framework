#!/usr/bin/env node
// Wrapper: full framework test suite via Bun. Exit code = suite result.
import { spawnSync } from "node:child_process";
const r = spawnSync("bun", ["test"], { stdio: "inherit" });
process.exit(r.status ?? 1);
