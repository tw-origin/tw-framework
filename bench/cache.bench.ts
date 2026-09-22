/**
 * Cache layer: directive resolution + revalidateTag invalidation sweeps.
 * (profiles are read ONCE -- the resolveCache hot path is what we measure)
 */
import { extractCacheDirective, resolveCache, readCacheProfilesSync } from "../packages/shared/tw/index.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderPipeline } from "../packages/server/tw/routing/render-pipeline.ts";

const ITER = Number(process.argv[2] ?? 50000);
const profiles = readCacheProfilesSync("/nonexistent");
const SRC = 'page { title "x" cache { life "minutes", tag "t" } }\ndiv { "y" }\n';
const meta = extractCacheDirective(SRC)!;

let t0 = performance.now();
for (let i = 0; i < ITER; i++) resolveCache(meta, profiles);
const ms = performance.now() - t0;
const rate = ITER / (ms / 1000);
console.log(`resolveCache: ${ITER} in ${ms.toFixed(0)}ms -> ${rate.toFixed(0)}/sec`);
console.log(`RESULT cache.resolve_per_sec ${Math.round(rate)}`);

const root = mkdtempSync(join(tmpdir(), "bench-cache-"));
mkdirSync(join(root, "home"), { recursive: true });
writeFileSync(join(root, "home", "page.tw"), 'page { title "t" render ssr cache { revalidate 60, tag "t" } }\ndiv { "z" }\n');
const p = new RenderPipeline({ rootDir: root, homeDir: join(root, "home"), enableCache: true });
p.render("/");
t0 = performance.now();
for (let i = 0; i < ITER; i++) p.revalidateTag("nope-" + (i % 100));
const ms2 = performance.now() - t0;
const rate2 = ITER / (ms2 / 1000);
console.log(`revalidateTag sweep (empty): ${ITER} in ${ms2.toFixed(0)}ms -> ${rate2.toFixed(0)}/sec`);
console.log(`RESULT cache.inval_sweep_per_sec ${Math.round(rate2)}`);
