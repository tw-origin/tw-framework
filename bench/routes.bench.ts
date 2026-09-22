/**
 * Route matching throughput: 1000 generated routes, exact + dynamic +
 * catch-all lookups.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRouteTree, matchRoute } from "../packages/server/tw/routing/scanner.ts";

const root = mkdtempSync(join(tmpdir(), "bench-routes-"));
for (let i = 0; i < 1000; i++) {
  const dir = i % 3 === 0
    ? join(root, `home`, `sec${i % 100}`, `[id]`)
    : i % 3 === 1
      ? join(root, `home`, `blog${i % 100}`)
      : join(root, `home`, `shop${i % 100}`, `[...rest]`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "page.tw"), 'page { title "r" }\ndiv { "x" }\n');
}
const tree = scanRouteTree({ homeDir: join(root, "home"), rootDir: root });

const ITER = Number(process.argv[2] ?? 20000);
const t0 = performance.now();
let hits = 0;
for (let i = 0; i < ITER; i++) {
  const u = i % 3 === 0 ? `/sec${i % 100}/post-${i}` : i % 3 === 1 ? `/blog${i % 100}` : `/shop${i % 100}/a/b`;
  if (matchRoute(tree, u)) hits++;
}
const ms = performance.now() - t0;
const rate = ITER / (ms / 1000);
console.log(`matchRoute: ${ITER} lookups (${hits} matched) in ${ms.toFixed(0)}ms -> ${rate.toFixed(0)}/sec`);
console.log(`RESULT routes.matches_per_sec ${Math.round(rate)}`);
