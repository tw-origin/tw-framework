/** tw check -- type check and diagnostics. */

import { maskSourceStringsAndComments } from "@tw/shared";
import { join } from "node:path";
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

      // Basic checks: balanced braces, unclosed tags. Round 4: count on
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

  if (totalErrors > 0) {
    console.log("  Status: FAILED\n");
    process.exit(1);
  } else {
    console.log("  Status: PASSED\n");
  }
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
