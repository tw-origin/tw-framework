/**
 * tw lsp -- start the TW language server on stdio for editor integration.
 *
 * The editor (or any LSP client) launches `tw lsp` and speaks JSON-RPC over
 * stdin/stdout. Diagnostic/status output goes to stderr so the protocol
 * channel stays clean.
 */

import { colors } from "../args";
import { join } from "node:path";
import { existsSync } from "node:fs";

export async function lspCommand(): Promise<void> {
  const rootDir = process.cwd();

  if (!existsSync(join(rootDir, "tw.config.ts")) && !existsSync(join(rootDir, "home"))) {
    console.error(`${colors.yellow("!")} Not inside a TW project (no tw.config.ts / home/) — starting anyway from ${rootDir}`);
  }

  // stderr only: stdout belongs to the LSP protocol.
  console.error(`  ${colors.bold("tw lsp")} — language server on stdio`);
  console.error(`  root: ${rootDir}`);
  console.error(`  features: completion, hover, format, diagnostics`);
  console.error(`  editor config (VS Code settings.json):`);
  console.error(`    "tw.serverPath": "tw lsp"`);
  console.error("");

  // Literal import path so esbuild bundles it for the Node CLI build.
  const { startLanguageServer } = await import("../../../../packages/lsp/tw/server/main.ts");

  startLanguageServer();

  // The server owns the process now: stdin is the protocol channel.
}
