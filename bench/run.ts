/**
 * Bench orchestrator.
 *
 *   bun bench/run.ts            # run all, print + write bench/results/results.json
 *   bun bench/run.ts --record   # also (re)write bench/baselines.json
 *   bun bench/run.ts --check    # fail (exit 1) if any metric regresses >25% vs baseline
 *
 * Each bench prints `RESULT <metric> <value>` lines which this runner parses.
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync } = await import("node:fs");
const BENCHES = ["compile.bench.ts", "render.bench.ts", "routes.bench.ts", "cache.bench.ts"];
const TOLERANCE = 0.25; // fail only if value < baseline * (1 - 0.25)

const results: Record<string, number> = {};
const human: Record<string, string[]> = {};
for (const b of BENCHES) {
  console.log(`\n== bench/${b} ==`);
  const p = Bun.spawnSync(["bun", `bench/${b}`], { cwd: import.meta.dir + "/.." });
  const out = p.stdout.toString().trim();
  const err = p.stderr.toString().trim();
  console.log(out);
  if (err) console.error(err);
  if (p.exitCode !== 0) { console.error(`bench/${b} FAILED (exit ${p.exitCode})`); process.exit(1); }
  human[b] = out.split("\n");
  for (const line of out.split("\n")) {
    const m = line.match(/^RESULT (\S+) (\d+)$/);
    if (m) results[m[1]] = Number(m[2]);
  }
}

mkdirSync("bench/results", { recursive: true });
writeFileSync("bench/results/results.json",
  JSON.stringify({ ranAt: new Date().toISOString(), metrics: results }, null, 2) + "\n");

const BASELINE_PATH = import.meta.dir + "/baselines.json";
const mode = process.argv[2] ?? "";

if (mode === "--record") {
  writeFileSync(BASELINE_PATH,
    JSON.stringify({ recordedAt: new Date().toISOString(), metrics: results }, null, 2) + "\n");
  console.log(`\nbaselines recorded (${Object.keys(results).length} metrics) -> bench/baselines.json`);
} else if (mode === "--check") {
  if (!existsSync(BASELINE_PATH)) { console.error("no bench/baselines.json -- run with --record first"); process.exit(1); }
  const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8")).metrics as Record<string, number>;
  let failed = 0;
  console.log("\n== regression check (fail if value < baseline x 0.75) ==");
  for (const [metric, baseline] of Object.entries(base)) {
    const now = results[metric];
    if (now === undefined) { console.log(`  ${metric.padEnd(28)} MISSING (baseline ${baseline})`); failed++; continue; }
    const floor = Math.round(baseline * (1 - TOLERANCE));
    const delta = ((now - baseline) / baseline * 100).toFixed(1);
    if (now < floor) { console.log(`  ${metric.padEnd(28)} FAIL  ${now} < ${floor} (${delta}%)`); failed++; }
    else console.log(`  ${metric.padEnd(28)} ok    ${now} vs ${baseline} (${delta}%)`);
  }
  if (failed > 0) { console.error(`\nbench: ${failed} regression(s)`); process.exit(1); }
  console.log("\nbench: no regressions");
} else {
  console.log(`\nwrote bench/results/results.json (${Object.keys(results).length} metrics). Use --record / --check for baselines.`);
}
