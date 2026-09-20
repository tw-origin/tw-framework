/** Error types -- structured error hierarchy for TW framework. */

export class TWError extends Error {
  public code: string;
  public severity: "error" | "warning" | "info";
  public context?: Record<string, any>;
  public cause?: Error;

  constructor(message: string, code: string = "TW000", severity: "error" | "warning" | "info" = "error", context?: Record<string, any>) {
    super(message);
    this.name = "TWError";
    this.code = code;
    this.severity = severity;
    this.context = context;
  }

  toJSON(): any {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      stack: this.stack,
    };
  }
}

export class CompileError extends TWError {
  public line: number;
  public col: number;
  public filePath?: string;

  constructor(message: string, line: number, col: number, code: string = "TW001", filePath?: string) {
    super(message, code, "error", { line, col, filePath });
    this.name = "CompileError";
    this.line = line;
    this.col = col;
    this.filePath = filePath;
  }
}

export class ParseError extends TWError {
  public line: number;
  public col: number;

  constructor(message: string, line: number, col: number, code: string = "TW002") {
    super(message, code, "error", { line, col });
    this.name = "ParseError";
    this.line = line;
    this.col = col;
  }
}

export class TypeError_ extends TWError {
  constructor(message: string, code: string = "TW003", context?: Record<string, any>) {
    super(message, code, "error", context);
    this.name = "TypeError";
  }
}

export class ValidationError extends TWError {
  constructor(message: string, code: string = "TW004", context?: Record<string, any>) {
    super(message, code, "warning", context);
    this.name = "ValidationError";
  }
}

export class RuntimeError extends TWError {
  constructor(message: string, code: string = "TW005", context?: Record<string, any>) {
    super(message, code, "error", context);
    this.name = "RuntimeError";
  }
}

export class ConfigurationError extends TWError {
  constructor(message: string, code: string = "TW006", context?: Record<string, any>) {
    super(message, code, "error", context);
    this.name = "ConfigurationError";
  }
}

export function isError(value: any): value is Error {
  return value instanceof Error;
}

export function isTWError(value: any): value is TWError {
  return value instanceof TWError;
}

export function toTWError(err: unknown): TWError {
  if (err instanceof TWError) return err;
  if (err instanceof Error) return new TWError(err.message, "TW000", "error", { originalError: err.name });
  return new TWError(String(err));
}
