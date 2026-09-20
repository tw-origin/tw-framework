/** CLI argument parser -- proper flag/option parsing with types. */

export interface ParsedArgs {
  command: string;
  subcommand?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
  raw: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const result: ParsedArgs = {
    command: args[0] ?? "",
    positional: [],
    flags: {},
    raw: args,
  };

  let i = 1; // Skip command
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      // Long flag
      const key = arg.slice(2);
      const next = args[i + 1];

      if (next && !next.startsWith("--")) {
        // Flag with value
        result.flags[key] = next;
        i += 2;
      } else {
        // Boolean flag
        result.flags[key] = true;
        i++;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short flag(s)
      const key = arg.slice(1);
      const next = args[i + 1];

      if (next && !next.startsWith("-")) {
        result.flags[key] = next;
        i += 2;
      } else {
        result.flags[key] = true;
        i++;
      }
    } else {
      // Positional argument
      if (!result.subcommand) {
        result.subcommand = arg;
      } else {
        result.positional.push(arg);
      }
      i++;
    }
  }

  return result;
}

export function getFlag(args: ParsedArgs, name: string, alias?: string, defaultValue?: string): string | undefined {
  const val = args.flags[name] ?? (alias ? args.flags[alias] : undefined);
  if (typeof val === "string") return val;
  if (typeof val === "boolean") return val ? "true" : "false";
  return defaultValue;
}

export function getFlagNumber(args: ParsedArgs, name: string, alias?: string, defaultValue?: number): number | undefined {
  const val = getFlag(args, name, alias);
  if (val === undefined) return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
}

export function getFlagBool(args: ParsedArgs, name: string, alias?: string): boolean {
  const val = args.flags[name] ?? (alias ? args.flags[alias] : undefined);
  return val === true || val === "true" || val === "1";
}

// --- Colored output ---------------------------------------------------------

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

const supportsColor = typeof process !== "undefined" && process.stdout?.isTTY && !process.env.NO_COLOR;

function paint(color: string, text: string): string {
  if (!supportsColor) return text;
  return `${color}${text}${ANSI.reset}`;
}

export const colors = {
  red: (s: string) => paint(ANSI.red, s),
  green: (s: string) => paint(ANSI.green, s),
  yellow: (s: string) => paint(ANSI.yellow, s),
  blue: (s: string) => paint(ANSI.blue, s),
  magenta: (s: string) => paint(ANSI.magenta, s),
  cyan: (s: string) => paint(ANSI.cyan, s),
  white: (s: string) => paint(ANSI.white, s),
  gray: (s: string) => paint(ANSI.gray, s),
  bold: (s: string) => paint(ANSI.bold, s),
  dim: (s: string) => paint(ANSI.dim, s),
};

// --- Progress indicator -----------------------------------------------------

export class ProgressBar {
  private current: number = 0;
  private total: number;
  private label: string;
  private width: number;

  constructor(label: string, total: number, width: number = 30) {
    this.label = label;
    this.total = total;
    this.width = width;
  }

  update(current: number): void {
    this.current = current;
    this.render();
  }

  increment(): void {
    this.current++;
    this.render();
  }

  complete(): void {
    this.current = this.total;
    this.render();
    process.stderr.write("\n");
  }

  private render(): void {
    const percent = Math.min(1, this.current / this.total);
    const filled = Math.round(this.width * percent);
    const empty = this.width - filled;
    const bar = "?".repeat(filled) + "?".repeat(empty);
    const percentStr = Math.round(percent * 100).toString().padStart(3);

    process.stderr.write(`\r  ${this.label} ${colors.cyan(bar)} ${percentStr}%`);
  }
}

// --- Spinner ----------------------------------------------------------------

export class Spinner {
  private frames = ["?", "?", "?", "?", "?", "?", "?", "?", "?", "?"];
  private index = 0;
  private label: string;
  private timer: any = null;

  constructor(label: string) {
    this.label = label;
  }

  start(): void {
    this.tick();
  }

  stop(message?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stderr.write(`\r  ${colors.green("OK")} ${message ?? this.label}\n`);
  }

  fail(message?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stderr.write(`\r  ${colors.red("?")} ${message ?? this.label}\n`);
  }

  private tick(): void {
    process.stderr.write(`\r  ${colors.cyan(this.frames[this.index])} ${this.label}`);
    this.index = (this.index + 1) % this.frames.length;
    this.timer = setInterval(() => {
      process.stderr.write(`\r  ${colors.cyan(this.frames[this.index])} ${this.label}`);
      this.index = (this.index + 1) % this.frames.length;
    }, 80);
  }
}
