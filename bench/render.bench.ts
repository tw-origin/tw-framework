/**
 * Render throughput: RenderPipeline true-MISS (unique cache keys) vs HIT.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderPipeline } from "../packages/server/tw/routing/render-pipeline.ts";

const root = mkdtempSync(join(tmpdir(), "bench-render-"));
mkdirSync(join(root, "home"), { recursive: true });
writeFileSync(join(root, "home", "page.tw"),
  'page { title "B" render ssr }\ndiv { h1 "hello" p "bench" }\n');
const p = new RenderPipeline({ rootDir: root, homeDir: join(root, "home"), enableCache: true });

const ITER = Number(process.argv[2] ?? 2000);

let t0 = performance.now();
// unique stateVars -> unique cache keys -> every render is a true MISS
for (let i = 0; i < ITER; i++) p.render("/", { i: String(i) });
const missMs = performance.now() - t0;
const missRate = ITER / (missMs / 1000);
console.log(`render MISS (unique keys, full pipeline): ${ITER} in ${missMs.toFixed(0)}ms -> ${missRate.toFixed(0)}/sec`);
console.log(`RESULT render.miss_per_sec ${Math.round(missRate)}`);

p.render("/"); // prime
t0 = performance.now();
for (let i = 0; i < ITER; i++) p.render("/");
const hitMs = performance.now() - t0;
const hitRate = ITER / (hitMs / 1000);
console.log(`render HIT (from cache): ${ITER} in ${hitMs.toFixed(0)}ms -> ${hitRate.toFixed(0)}/sec`);
console.log(`RESULT render.hit_per_sec ${Math.round(hitRate)}`);
