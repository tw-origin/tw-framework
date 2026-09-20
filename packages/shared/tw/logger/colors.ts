/** ANSI color codes and level-specific styling. */

import { LogLevel } from "./levels";

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  blink: "\x1b[5m",
  inverse: "\x1b[7m",
  hidden: "\x1b[8m",
  strikethrough: "\x1b[9m",

  black: "\x1b[30m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m",
  cyan: "\x1b[36m", white: "\x1b[37m",

  bgBlack: "\x1b[40m", bgRed: "\x1b[41m", bgGreen: "\x1b[42m",
  bgYellow: "\x1b[44m", bgBlue: "\x1b[44m", bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m", bgWhite: "\x1b[47m",

  brightBlack: "\x1b[90m", brightRed: "\x1b[91m", brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m", brightBlue: "\x1b[94m", brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m", brightWhite: "\x1b[97m",
};

export const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.SILENT]: ANSI.dim,
  [LogLevel.ERROR]: ANSI.red,
  [LogLevel.WARN]: ANSI.yellow,
  [LogLevel.INFO]: ANSI.blue,
  [LogLevel.DEBUG]: ANSI.magenta,
  [LogLevel.TRACE]: ANSI.dim,
};

export const LEVEL_ICONS: Record<LogLevel, string> = {
  [LogLevel.SILENT]: "",
  [LogLevel.ERROR]: "?",
  [LogLevel.WARN]: "?",
  [LogLevel.INFO]: "?",
  [LogLevel.DEBUG]: "o",
  [LogLevel.TRACE]: "o",
};

