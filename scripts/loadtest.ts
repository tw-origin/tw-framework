// CLI: bun scripts/loadtest.ts [--url http://localhost:8123] [--path /counter]
//                        [--total 3000] [--concurrency 50]
const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = arg("url", "http://localhost:8123");
const PATH_ = arg("path", "/counter");
const CONCURRENCY = Number(arg("concurrency", "50"));
const TOTAL = Number(arg("total", "3000"));
const latencies: number[] = [];
let done = 0, errors = 0;
const t0 = performance.now();
async function worker() {
  while (true) {
    const i = done + 1;
    if (i > TOTAL) return;
    const s = performance.now();
    try {
      const r = await fetch(BASE + PATH_, { headers: { "user-agent": "Mozilla/5.0 (loadtest)" } });
      await r.arrayBuffer();
      if (r.status !== 200) errors++;
    } catch { errors++; }
    latencies.push(performance.now() - s);
    done++;
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const secs = (performance.now() - t0) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.floor(latencies.length * p) - 1]?.toFixed(1);
console.log(`requests: ${done}, errors: ${errors}`);
console.log(`RPS: ${(done / secs).toFixed(0)}, duration: ${secs.toFixed(1)}s`);
console.log(`latency ms — p50: ${pct(0.5)}, p90: ${pct(0.9)}, p95: ${pct(0.95)}, p99: ${pct(0.99)}, max: ${latencies[latencies.length-1].toFixed(1)}`);
