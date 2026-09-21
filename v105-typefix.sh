#!/usr/bin/env bash
# TW Framework v1.0.5 CI typecheck fix (4 errors: TS2448 vdom, TS2352 render-pipeline, TS2345 crypto x2)
# Kaise: cp /sdcard/Download/v105-typefix.sh ~/tw-framework/ && cd ~/tw-framework && bash v105-typefix.sh
set -e
cd "$(dirname "$0")"
[ -f apps/cli/package.json ] || { echo "!! repo root me chalao"; exit 1; }
echo "=== v1.0.5 typecheck fix ==="
node << 'EOF'
const fs = require("fs");
function patch(path, pairs) {
  let s = fs.readFileSync(path, "utf8");
  let n = 0;
  for (const [o, w] of pairs) { if (s.includes(o)) { s = s.split(o).join(w); n++; } }
  if (n !== pairs.length) { console.log("!! " + path + ": " + n + "/" + pairs.length + " -- already patched ya base alag hai"); process.exit(1); }
  fs.writeFileSync(path, s);
  console.log("OK  " + path + " (" + n + "/" + pairs.length + ")");
}

// 1) vdom.ts TS2448: `ctx` used before its declaration (TDZ) -- the layout
//    {page.title} seeding silently failed on EVERY render.
patch("packages/compiler/tw/codegen/vdom.ts", [[`  {
    let pageTitle = "TW Page";
    for (const dir of pageProgram.directives || []) {
      if (dir.type === "PageDirective" && (dir as any).key === "title") {
        const t = (dir as any).value;
        if (t != null && String(t) !== "") pageTitle = String(t);
      }
    }
    try { ctx.stateVars["page"] = JSON.stringify({ title: pageTitle }); } catch { /* ignore */ }
  }`, `  let pageTitle = "TW Page";
  for (const dir of pageProgram.directives || []) {
    if (dir.type === "PageDirective" && (dir as any).key === "title") {
      const t = (dir as any).value;
      if (t != null && String(t) !== "") pageTitle = String(t);
    }
  }`]]);

patch("packages/compiler/tw/codegen/vdom.ts", [[`  const pageCtx: any = createContext("ssr");
  seedCtx(pageCtx);`, `  const pageCtx: any = createContext("ssr");
  seedCtx(pageCtx);
  // Seed the canonical layout's {page.title} -- previously a TDZ use of `ctx`
  // that the try/catch swallowed on every render.
  try { pageCtx.stateVars["page"] = JSON.stringify({ title: pageTitle }); } catch { /* ignore */ }`]]);

// 2) render-pipeline.ts TS2352: insufficient-overlap cast in error.tw path
patch("packages/server/tw/routing/render-pipeline.ts", [[`            renderMode: "ssr",
            durationMs: performance.now() - startTime,
          } as RouteRenderResult;`, `            renderMode: "ssr",
            durationMs: performance.now() - startTime,
          } as unknown as RouteRenderResult;`]]);

// 3+4) crypto TS2345 x2: ArrayBufferLike vs ArrayBuffer
patch("packages/shared/tw/crypto/index.ts", [[`  const encrypted = new Uint8Array(dataHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))).buffer;`, `  const encrypted = new Uint8Array(dataHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))).buffer as ArrayBuffer;`]]);
console.log("SAARE 4 FIX LAG GAYE");
EOF

echo "=== git commit + push ==="
git add -A
git commit -m "v1.0.5: fix CI typecheck (TS2448 vdom TDZ + TS2352 cast + TS2345 crypto x2)" || echo "(nothing to commit)"
git push origin main
echo ""
echo "=== DONE — GitHub Actions ab dobara chalega, is baar publish hoga ==="
