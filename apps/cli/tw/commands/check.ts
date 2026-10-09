/** tw check -- type check and diagnostics. */

import { maskSourceStringsAndComments } from "@tw/shared";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

export async function checkCommand(): Promise<void> {
  const args = process.argv.slice(3);
  const rootDir = process.cwd();
  const srcDir = join(rootDir, "home");

  console.debug("\n  tw check -- running type check and diagnostics\n");

  const twFiles: string[] = [];
  if (existsSync(srcDir)) {
    collectFiles(srcDir, ".tw", twFiles);
  }

  if (twFiles.length === 0) {
    console.debug("  No .tw files found in pages/\n");
    return;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;

  try {
    const { compile } = await import("@tw/compiler");

    for (const filePath of twFiles) {
      const relativePath = filePath.replace(rootDir + "/", "");

      try {
        const source = readFileSync(filePath, "utf-8");
        const result = await compile(source, {
          filePath,
          optimize: false,
          diagnostics: true,
          transforms: false,
        });

        const diagnostics = result.diagnostics || [];
        const errors = diagnostics.filter((d: any) => d.severity === "error");
        const warnings = diagnostics.filter((d: any) => d.severity === "warning");
        const info = diagnostics.filter((d: any) => d.severity === "info");

        // undefined components passed "no issues".
        // A capitalized tag that no import resolves and no components/<X>.tw
        // file backs is almost certainly a typo -- flag it.
        const checkSource = readFileSync(filePath, "utf-8");
        const usedTags = new Set<string>();
        const collectUsed = (n: any) => {
          if (!n) return;
          if (n.type === "Element" || n.type === "Component") {
            const t = n.tag ?? n.name;
            if (typeof t === "string" && t[0] === t[0].toUpperCase()) usedTags.add(t);
          }
          for (const c of n.children ?? []) collectUsed(c);
          if (n.type === "If" || n.type === "For" || n.type === "While") for (const c of n.body ?? []) collectUsed(c);
        };
        if (result.ast) { for (const n of result.ast.body ?? []) collectUsed(n); }
        const SAFE_TAGS = new Set(["Link", "Suspense", "RouterLink", "Image", "optImage"]);
        const importedNames = new Set<string>();
        for (const im of checkSource.matchAll(/import\s+([A-Za-z_]\w*)\s+from/g)) importedNames.add(im[1]);
        for (const im of checkSource.matchAll(/import\s*\{([^}]+)\}/g)) {
          for (const part of im[1].split(",")) {
            const nm = part.split(" as ").pop()!.trim();
            if (nm) importedNames.add(nm);
          }
        }
        const unknownComponents: string[] = [];
        for (const tag of usedTags) {
          if (SAFE_TAGS.has(tag) || importedNames.has(tag)) continue;
          if (findComponentUp(dirname(filePath), tag)) continue;
          unknownComponents.push(tag);
        }
        if (unknownComponents.length > 0) {
          console.debug(`  ? ${relativePath} -- ${unknownComponents.length} unknown component(s)`);
          for (const t of unknownComponents) {
            console.debug(`    ? TW098 unknown component <${t}> -- no import resolves it and no components/${t}.tw exists`);
          }
          totalWarnings += unknownComponents.length;
        }

        totalErrors += errors.length;
        totalWarnings += warnings.length;
        totalInfo += info.length;

        if (diagnostics.length === 0) {
          console.debug(`  OK ${relativePath} -- no issues`);
        } else {
          console.debug(`  ? ${relativePath} -- ${errors.length} errors, ${warnings.length} warnings, ${info.length} info`);

          for (const d of diagnostics) {
            const sev = d.severity === "error" ? "?" : d.severity === "warning" ? "?" : "?";
            const loc = `line ${d.line}, col ${d.col}`;
            console.debug(`    ${sev} ${d.code} ${loc}: ${d.message}`);
          }
        }
      } catch (err: any) {
        totalErrors++;
        console.debug(`  X ${relativePath}: ${err.message}`);
      }
    }
  } catch {
    // Fallback: basic syntax check
    console.debug("  Compiler not found, running basic checks...\n");

    for (const filePath of twFiles) {
      const relativePath = filePath.replace(rootDir + "/", "");
      const source = readFileSync(filePath, "utf-8");

      // Basic checks: balanced braces, unclosed tags. count on
      // the MASKED source -- braces inside strings/comments used to make
      // valid pages report "unbalanced braces".
      const maskedSource = maskSourceStringsAndComments(source);
      const openBraces = (maskedSource.match(/\{/g) || []).length;
      const closeBraces = (maskedSource.match(/\}/g) || []).length;

      if (openBraces !== closeBraces) {
        totalErrors++;
        console.log(`  X ${relativePath}: unbalanced braces (${openBraces} open, ${closeBraces} close)`);
      } else {
        console.log(`  OK ${relativePath} -- syntax OK`);
      }
    }
  }

  console.log(`\n  Summary: ${totalErrors} errors, ${totalWarnings} warnings, ${totalInfo} info`);

  // warnings never failed `tw check`, so it could
  // not gate CI. --max-warnings=N (or --strict for 0) exits 1 over the cap.
  const argv = process.argv.slice(2);
  let maxWarnings: number | null = null;
  if (argv.includes("--strict")) maxWarnings = 0;
  const mwIdx = argv.indexOf("--max-warnings");
  if (mwIdx !== -1 && argv[mwIdx + 1] !== undefined && /^\d+$/.test(argv[mwIdx + 1])) {
    maxWarnings = Number(argv[mwIdx + 1]);
  } else {
    const eq = argv.find((a) => a.startsWith("--max-warnings="));
    if (eq && /^\d+$/.test(eq.split("=")[1])) maxWarnings = Number(eq.split("=")[1]);
  }

  if (totalErrors > 0) {
    console.log("  Status: FAILED\n");
    process.exit(1);
  } else if (maxWarnings !== null && totalWarnings > maxWarnings) {
    console.log(`  Status: FAILED -- ${totalWarnings} warnings exceed --max-warnings=${maxWarnings}\n`);
    process.exit(1);
  } else {
    console.log("  Status: PASSED\n");
  }
}

/** Walk up from dir looking for components/<name>.tw (). */
function findComponentUp(dir: string, name: string): boolean {
  let cur = dir;
  for (let i = 0; i < 12 && cur && cur !== "/"; i++) {
    try {
      const candidate = join(cur, "components", name + ".tw");
      if (existsSync(candidate)) return true;
    } catch { /* ignore */ }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}

function collectFiles(dir: string, ext: string, results: string[]): void {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, ext, results);
    } else if (entry.endsWith(ext)) {
      results.push(fullPath);
    }
  }
}
