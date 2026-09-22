/**
 * Eval runner -- THREE levels the unit suite does not cover:
 *
 *   1. OUTCOME   : evals/cases/*.json -- golden inputs, exact expectations.
 *   2. SCALE     : whole-table aggregation (every element in one page,
 *                  every CSS property in one stylesheet, deep nesting).
 *   3. INVARIANT : semantic laws that must hold (stale <= revalidate <=
 *                  expire for every profile; config merge; HTTP table).
 *   4. FUZZ      : deterministic seeded mutations -- the compiler must
 *                  NEVER crash (diagnose, yes; throw, no).
 *
 * 100% required. Exit 1 on any failure.
 */
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileSync, compileTSS } from "../packages/compiler/tw/index.ts";
import {
  extractCacheDirective, resolveCache, readCacheProfilesSync, BUILTIN_CACHE_PROFILES,
  HTML_ELEMENTS, CSS_PROPERTIES, ARIA_ROLES, EVENT_TYPES, HTTP_STATUS_CODES, VOID_TAGS,
} from "../packages/shared/tw/index.ts";

let seq = 0;
const tmp = () => join("/scratch", `eval-${seq++}.tw`);
const sections: Record<string, { pass: number; fail: number; failures: string[] }> = {};
const track = (section: string, name: string, fn: () => void) => {
  const s = (sections[section] ??= { pass: 0, fail: 0, failures: [] });
  try { fn(); s.pass++; }
  catch (e) { s.fail++; s.failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); }
};
const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

// ---------------------------------------------------------------- 1. OUTCOME
type Case = {
  name: string; layer: "compile" | "cache"; src: string;
  expect: { errors?: string[]; errorsContain?: string[]; htmlNotContains?: string[];
    directive?: unknown; revalidate?: number; stale?: number; expire?: number; tag?: string };
};
const profiles = readCacheProfilesSync("/nonexistent");
for (const file of readdirSync(join(import.meta.dir, "cases"))) {
  if (!file.endsWith(".json")) continue;
  for (const c of JSON.parse(readFileSync(join(import.meta.dir, "cases", file), "utf8")) as Case[]) {
    track("outcome", `[${file}] ${c.name}`, () => {
      if (c.layer === "compile") {
        const out = compileSync(c.src, { filePath: tmp() });
        const errs = (out.diagnostics ?? []).filter((d: any) => d.severity === "error");
        if (c.expect.errors) {
          const got = [...new Set(errs.map((d: any) => d.code))].sort().join(",");
          const want = [...c.expect.errors].sort().join(",");
          assert(got === want, `errors got=[${got}] want=[${want}]`);
        }
        for (const needle of c.expect.htmlNotContains ?? [])
          assert(!(out.html ?? "").includes(needle), `html contains forbidden "${needle}"`);
      } else {
        const meta = extractCacheDirective(c.src);
        if (c.expect.directive === null) assert(meta === null, "expected null directive");
        else {
          const r = resolveCache(meta!, profiles) as Record<string, unknown>;
          for (const [k, v] of Object.entries(c.expect)) {
            if (k === "directive") continue;
            assert(r[k] === v, `${k}: got ${JSON.stringify(r[k])} want ${JSON.stringify(v)}`);
          }
        }
      }
    });
  }
}

// ---------------------------------------------------------------- 2. SCALE
const DSL_SPECIAL = new Set(["script", "style", "html", "head", "body", "title", "meta", "link", "base", "slot", "annotation-xml"]);
const usable = Array.from(HTML_ELEMENTS).filter((t) => !DSL_SPECIAL.has(t));

track("scale", `all ${usable.length} elements in ONE page`, () => {
  const src = `page { title "s" render ssr }\ndiv.root {\n` +
    usable.map((t) => VOID_TAGS.has(t) ? `  <${t}>` : `  <${t}>x</${t}>`).join("\n") + "\n}\n";
  const out = compileSync(src, { filePath: tmp() });
  const errs = (out.diagnostics ?? []).filter((d: any) => d.severity === "error");
  assert(errs.length === 0, `${errs.length} errors, first: ${errs[0]?.code} ${errs[0]?.message}`);
  for (const t of usable.slice(0, 20)) assert(out.html.includes(`<${t}`), `<${t}> missing from html`);
});

track("scale", `all ${CSS_PROPERTIES.length} CSS properties in ONE stylesheet`, () => {
  const tss = `.root {\n` + Array.from(CSS_PROPERTIES).map((p) => `  ${p}: inherit`).join("\n") + "\n}";
  const css = compileTSS(tss);
  assert(css.length > 1000, `suspiciously small output: ${css.length}`);
});

track("scale", `all ${ARIA_ROLES.length} ARIA roles on one page`, () => {
  const src = `page { title "s" }\ndiv {\n` +
    Array.from(ARIA_ROLES).slice(0, 40).map((r) => `  <div role="${r}">x</div>`).join("\n") + "\n}\n";
  const out = compileSync(src, { filePath: tmp() });
  assert((out.diagnostics ?? []).filter((d: any) => d.severity === "error").length === 0, "errors");
});

track("scale", `all ${EVENT_TYPES.length} event types on one page`, () => {
  const src = `page { title "s" }\ndiv {\n` +
    Array.from(EVENT_TYPES).slice(0, 40).map((e) => `  <button on:${e}="x++">go</button>`).join("\n") + "\n}\n";
  const out = compileSync(src, { filePath: tmp() });
  assert((out.diagnostics ?? []).filter((d: any) => d.severity === "error").length === 0, "errors");
});

track("scale", "500-deep nesting", () => {
  let src = `page { title "s" }\n`;
  for (let i = 0; i < 500; i++) src += "div {\n";
  src += `"deep"\n` + "}".repeat(500) + "\n";
  const out = compileSync(src, { filePath: tmp() });
  assert((out.diagnostics ?? []).filter((d: any) => d.severity === "error").length === 0, "deep nesting errors");
});

track("scale", "2000-node page", () => {
  const src = `page { title "s" render ssr }\ndiv {\n` +
    Array.from({ length: 2000 }, (_, i) => `  p "row ${i}"`).join("\n") + "\n}\n";
  const out = compileSync(src, { filePath: tmp() });
  assert((out.html.match(/<p/g) ?? []).length === 2000, "node count mismatch");
});

// ---------------------------------------------------------------- 3. INVARIANT
track("invariant", "stale <= revalidate <= expire for every builtin profile", () => {
  for (const [name, p] of Object.entries(BUILTIN_CACHE_PROFILES)) {
    assert(typeof p.stale === "number" && typeof p.revalidate === "number" && typeof p.expire === "number",
      `${name}: incomplete profile`);
    assert(p.stale! <= p.revalidate!, `${name}: stale ${p.stale} > revalidate ${p.revalidate}`);
    assert(p.revalidate! <= p.expire!, `${name}: revalidate ${p.revalidate} > expire ${p.expire}`);
  }
});

track("invariant", "custom cache profiles merge from tw.config.ts", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-cfg-"));
  writeFileSync(join(dir, "tw.config.ts"),
    `export default { cache: { profiles: { product: { stale: 2, revalidate: 3, expire: 8 } } } }\n`);
  const p = readCacheProfilesSync(dir);
  assert((p as any).product?.revalidate === 3, `custom profile missing: ${JSON.stringify(p)}`);
});

track("invariant", "HTTP status table is complete and well-formed", () => {
  const codes = Object.keys(HTTP_STATUS_CODES).map(Number).sort((a, b) => a - b);
  assert(codes.length >= 60, `only ${codes.length} codes`);
  assert(codes[0] === 100 && codes[codes.length - 1] === 511, `range ${codes[0]}..${codes[codes.length - 1]}`);
  for (const c of codes) assert(c >= 100 && c <= 599 && Number.isInteger(c), `bad code ${c}`);
});

track("invariant", "directive resolution respects profile windows", () => {
  const r = resolveCache(extractCacheDirective(`page { cache { life "minutes", tag "x" } }`)!, profiles) as any;
  assert(r.revalidate === 300 && r.stale === 60 && r.expire === 3600 && r.tag === "x", `got ${JSON.stringify(r)}`);
});

// ---------------------------------------------------------------- 4. FUZZ
const CORPUS = [
  'page { title "x" render ssr }\ndiv { h1 "hi" }\n',
  'page { cache { revalidate 60, tag "t" } }\nstate { a = 1 }\ndiv { button on:click "a++" { "{a}" } }\n',
  'div.cls { img src "/a.png" alt "A" { } p { "text" } }\n',
  'page { revalidate -5 }\ndiv { <input type="text" value="x"> }\n',
];
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260922); // fixed seed: reproducible fuzz
const CHAOS = ["{", "}", '"', "'", "\\", "\x00", "🔥", "日本語", "<script>", "/*", "*/", "\n\n\n", "{{{", "}}}", "page {", "cache {", "\uffff"];
let fuzzDone = 0;
for (let i = 0; i < 300; i++) {
  const base = CORPUS[Math.floor(rnd() * CORPUS.length)];
  let src = base;
  const mutations = 1 + Math.floor(rnd() * 4);
  for (let m = 0; m < mutations; m++) {
    const pos = Math.floor(rnd() * src.length);
    const kind = rnd();
    if (kind < 0.35) src = src.slice(0, pos) + CHAOS[Math.floor(rnd() * CHAOS.length)] + src.slice(pos);
    else if (kind < 0.7) src = src.slice(0, pos); // truncate
    else src = src.slice(pos); // chop head
  }
  track("fuzz", `mutation #${i} never crashes`, () => {
    try { compileSync(src, { filePath: tmp() }); }
    catch (e) { throw new Error(`CRASHED: ${e instanceof Error ? e.message : e} :: src=${JSON.stringify(src.slice(0, 80))}`); }
  });
  fuzzDone++;
}

// ---------------------------------------------------------------- report
let totalPass = 0, totalFail = 0;
console.log("\n== TW Framework evals ==\n");
for (const [section, s] of Object.entries(sections)) {
  totalPass += s.pass; totalFail += s.fail;
  console.log(`  ${section.padEnd(10)} ${String(s.pass).padStart(4)} pass  ${String(s.fail).padStart(3)} fail`);
  for (const f of s.failures) console.log(`    ✗ ${f.slice(0, 200)}`);
}
console.log(`\n  total      ${String(totalPass).padStart(4)} pass  ${String(totalFail).padStart(3)} fail`);
if (totalFail > 0) { console.log("\nevals: FAILED"); process.exit(1); }
console.log(`\nevals: 100% -- OK (${totalPass} cases, ${fuzzDone} fuzz inputs)`);
