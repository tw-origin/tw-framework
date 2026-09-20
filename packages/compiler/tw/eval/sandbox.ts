/** Safe evaluation sandbox - restricts access to dangerous globals. */


const FORBIDDEN_GLOBALS = new Set([
  "globalThis", "process", "require", "module", "exports",
  "constructor", "prototype", "__proto__",
  "window", "document", "eval", "Function",
  "setTimeout", "setInterval", "setImmediate",
  "fetch", "XMLHttpRequest", "WebSocket",
]);

export interface SandboxOptions {
  allowedGlobals?: Set<string>;
  forbiddenGlobals?: Set<string>;
  maxCallDepth?: number;
  maxStringLength?: number;
  timeout?: number;
}

export class Sandbox {
  private allowedGlobals: Set<string>;
  private forbiddenGlobals: Set<string>;
  private maxCallDepth: number;
  private maxStringLength: number;
  private callDepth: number = 0;

  constructor(opts?: SandboxOptions) {
    this.allowedGlobals = opts?.allowedGlobals ?? new Set(["Math", "JSON", "Date", "Number", "String", "Boolean", "Array", "Object", "parseInt", "parseFloat", "isNaN", "isFinite", "RegExp", "Error"]);
    this.forbiddenGlobals = opts?.forbiddenGlobals ?? FORBIDDEN_GLOBALS;
    this.maxCallDepth = opts?.maxCallDepth ?? 100;
    this.maxStringLength = opts?.maxStringLength ?? 100000;
  }

  isAllowed(name: string): boolean {
    return this.allowedGlobals.has(name) && !this.forbiddenGlobals.has(name);
  }

  enterCall(): boolean {
    this.callDepth++;
    return this.callDepth <= this.maxCallDepth;
  }

  exitCall(): void {
    this.callDepth--;
  }

  checkStringLength(str: string): string {
    if (str.length > this.maxStringLength) {
      return str.slice(0, this.maxStringLength) + "...[truncated]";
    }
    return str;
  }

  reset(): void {
    this.callDepth = 0;
  }
}



function btoa(str: string): string {
  try {
    return (globalThis as any).btoa?.(str) ?? Buffer.from(str, "binary").toString("base64");
  } catch {
    return "";
  }
}

function atob(str: string): string {
  try {
    return (globalThis as any).atob?.(str) ?? Buffer.from(str, "base64").toString("binary");
  } catch {
    return "";
  }
}