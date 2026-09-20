import { createCommand } from "./create";
import { devCommand } from "./dev";
import { buildCommand } from "./build";
import { serveCommand } from "./serve";
import { shipCommand } from "./ship";
import { adapterCommand } from "./adapter";
import { testCommand } from "./test";
import { checkCommand } from "./check";
import { pluginCommand } from "./plugin";
import { lspCommand } from "./lsp";
import { helpText } from "../help";
import { parseArgs, colors } from "../args";

const VERSION = "1.0.0";

const commands: Record<string, () => Promise<void>> = {
  create: createCommand,
  dev: devCommand,
  build: buildCommand,
  serve: serveCommand,
  ship: shipCommand,
  adapter: adapterCommand,
  check: checkCommand,
  test: testCommand,
  plugin: pluginCommand,
  lsp: lspCommand,
};

export async function run(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed.command || parsed.command === "--help" || parsed.command === "-h" || parsed.command === "help") {
    console.log(helpText);
    return;
  }

  if (parsed.command === "--version" || parsed.command === "-v") {
    console.log(`  ${colors.bold("tw")} ${colors.cyan(`v${VERSION}`)}`);
    return;
  }

  const handler = commands[parsed.command];
  if (!handler) {
    console.error(`  ${colors.red("?")} Unknown command: ${parsed.command}`);
    console.log("\n" + helpText);
    process.exit(1);
  }

  try {
    await handler();
  } catch (err: any) {
    console.error(`\n  ${colors.red("?")} ${err.message}\n`);
    if (process.env.TW_DEBUG === "1") {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

export { buildCommand } from "./build";
export { checkCommand } from "./check";
export { createCommand, slugify } from "./create";
export { devCommand } from "./dev";
export { pluginCommand } from "./plugin";
export { serveCommand } from "./serve";
export { shipCommand } from "./ship";
export { adapterCommand } from "./adapter";
