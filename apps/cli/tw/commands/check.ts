/** tw check -- type check and diagnostics. */

import { maskSourceStringsAndComments } from "@tw/shared";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { scanComponents, registerImportedComponents } from "../components";

export async function checkCommand(): Promise<void> {
  const args = process.argv.slice(3);
  const rootDir = process.cwd();
  // `--ignore TW054,TW046` (repeatable, space or comma separated) lets a project
  // accept a rule it has decided is not a defect, so CI can gate on the rest
  // instead of drowning in noise it has already triaged.
  const ignored = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ignore" && args[i + 1]) {
      for (const code of String(args[i + 1]).split(/[,\s]+/)) {
        if (code) ignored.add(code.trim().toUpperCase());
      }
      i++;
    } else if (args[i].startsWith("--ignore=")) {
      for (const code of args[i].slice("--ignore=".length).split(/[,\s]+/)) {
        if (code) ignored.add(code.trim().toUpperCase());
      }
    }
  }
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

  // Stylesheets: structural checks only (unbalanced braces, empty values,
  // unknown at-rules, colon-less declarations in .css). No value grammar, so a
  // valid modern property can never be flagged.
  let valueChecksSkipped = 0;
  const cssFiles: string[] = [];
  for (const dir of [srcDir, join(rootDir, "style"), join(rootDir, "public")]) {
    if (!existsSync(dir)) continue;
    for (const ext of [".tss", ".css", ".scss"]) collectFiles(dir, ext, cssFiles);
  }
  if (cssFiles.length) {
    try {
      const mod: any = await import("@tw/compiler");
      const validate = mod.validateCssStructure;
      if (typeof validate === "function") {
        for (const f of [...new Set(cssFiles)]) {
          const src = readFileSync(f, "utf-8");
          const rel = f.replace(rootDir + "/", "");
          const found = validate(src, f);
          // Value-level pass: optional, warning-only, on the CSS as written --
          // before any scoped-selector rewrite, so positions point at the file.
          try {
            const values = await mod.validateCssValues(
              /\.tss$/i.test(f) ? mod.compileTSS(src) : src,
              await projectCssTreeLoader(rootDir),
            );
            if (values?.skipped) valueChecksSkipped++;
            for (const d of values?.findings ?? []) {
              if (ignored.has(d.code)) continue;
              console.debug(`    ! ${d.code} line ${d.line}, col ${d.col}: ${d.message}`);
              console.debug(`      ${rel}`);
              totalWarnings++;
            }
          } catch { /* optional pass -- never fail the run */ }

          for (const d of found) {
            if (ignored.has(d.code)) continue;
            // TW308 is advisory -- see the code table.
            const isWarning = d.code === "TW308";
            console.debug(`    ${isWarning ? "!" : "\u2717"} ${d.code} line ${d.line}, col ${d.col}: ${d.message}`);
            console.debug(`      ${rel}`);
            if (isWarning) totalWarnings++; else totalErrors++;
          }
        }
      }
    } catch { /* the compiler could not be loaded -- the .tw pass reports that */ }
    if (valueChecksSkipped > 0) {
      console.debug("  ! value-level CSS checks skipped (" + valueChecksSkipped + " file(s)): css-tree is not installed.");
      console.debug("    structural checks still ran; install css-tree to enable them.");
    }
  }

  // Load the compiler ONCE, and fall back to the basic syntax check ONLY when
  // the module genuinely cannot be imported. The old outer `catch` wrapped the
  // whole run: a compiler that loaded and then threw mid-loop silently re-ran
  // the fallback over every file, double-counting the errors already reported.
  let compilerMod: any = null;
  try {
    compilerMod = await import("@tw/compiler");
  } catch (e: any) {
    console.debug("  Compiler unavailable (" + (e?.message ?? e) + ") -- running basic checks...\n");
  }

  if (compilerMod) {
    const { compile, compileSync, registerComponentTemplate, clearComponentRegistry } = compilerMod;

    // Seed the codegen component registry the same way `tw build` does. Without
    // it, every imported component compiles as "unknown component" even though
    // the build resolves it.
    scanComponents(rootDir, { compileSync, registerComponentTemplate, clearComponentRegistry });

    for (const filePath of twFiles) {
      const relativePath = filePath.replace(rootDir + "/", "");

      try {
        const source = readFileSync(filePath, "utf-8");
        // Register components this page imports by path, so a component outside
        // components/ resolves from the import just like the build's does.
        registerImportedComponents(filePath, rootDir, { compileSync, registerComponentTemplate, clearComponentRegistry }, source);
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

        const kept = ignored.size === 0 ? diagnostics : diagnostics.filter((d: any) => !ignored.has(String(d.code).toUpperCase()));
        const keptErrors = kept.filter((d: any) => d.severity === "error");
        const keptWarnings = kept.filter((d: any) => d.severity === "warning");
        const keptInfo = kept.filter((d: any) => d.severity !== "error" && d.severity !== "warning");
        totalErrors += keptErrors.length;
        totalWarnings += keptWarnings.length;
        totalInfo += keptInfo.length;

        if (kept.length === 0) {
          console.debug(`  OK ${relativePath} -- no issues`);
        } else {
          console.debug(`  ? ${relativePath} -- ${keptErrors.length} errors, ${keptWarnings.length} warnings, ${keptInfo.length} info`);

          for (const d of kept) {
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
  } else {
    // Fallback: basic syntax check -- the compiler module could not be loaded.
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

/**
 * Load css-tree from the project being checked, not from this package.
 *
 * The framework declares no dependency on css-tree (`dependencies` stays empty),
 * so a bare `import("css-tree")` inside the compiler resolves against the
 * framework's own node_modules and never finds it -- even when the user's
 * project has it installed. Resolving from the project root makes the user's
 * install the one that counts, and still fails cleanly when they have none.
 */
export async function projectCssTreeLoader(rootDir: string): Promise<(() => Promise<any>) | undefined> {
  try {
    // Imported here, not at the top of the file: the node bundle's banner
    // already declares `createRequire`, and a second top-level binding is a
    // SyntaxError in an ESM bundle ("Identifier 'createRequire' has already
    // been declared"). A dynamic import keeps it out of module scope.
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const req = createRequire(join(rootDir, "package.json"));
    const resolved = req.resolve("css-tree");
    return () => import(pathToFileURL(resolved).href);
  } catch {
    return undefined; // not installed -- validateCssValues reports `skipped`
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
