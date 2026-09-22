/**
 * Compile throughput: compileSync on a representative page.
 * Prints: human line + `RESULT compile.pages_per_sec <n>` (parsed by run.ts).
 */
import { compileSync } from "../packages/compiler/tw/index.ts";

const SRC = `page { title "Bench" render ssr }
state { count = 0, items = ["a", "b", "c"] }

div.page {
  h1 "Count: {count}"
  ul.list {
    button on:click "count++" { "Increment" }
  }
}
`;

const ITER = Number(process.argv[2] ?? 2000);
const t0 = performance.now();
for (let i = 0; i < ITER; i++) {
  compileSync(SRC, { filePath: `/tmp/bench-compile-${i % 32}.tw` });
}
const ms = performance.now() - t0;
const rate = ITER / (ms / 1000);
console.log(`compile: ${ITER} pages in ${ms.toFixed(0)}ms -> ${rate.toFixed(0)} pages/sec`);
console.log(`RESULT compile.pages_per_sec ${Math.round(rate)}`);
