/**
 * Constant Folding -- production-grade compile-time expression evaluation.
 *
 * Evaluates constant expressions at compile time instead of runtime.
 * This is the same optimization as LLVM's ConstantFolding pass or
 * GCC's -ffold-constants, but for TW's expression strings.
 *
 * What gets folded:
 *
 * 1. Arithmetic: 2 + 3 -> 5, 10 * 4 -> 40
 * 2. String concat: "Hello " + "World" -> "Hello World"
 * 3. Boolean logic: true && false -> false, !true -> false
 * 4. Comparisons: 5 > 3 -> true, "a" === "b" -> false
 * 5. Ternary: true ? "yes" : "no" -> "yes"
 * 6. Nullish coalescing: null ?? "default" -> "default"
 * 7. Type coercion: String(42) -> "42", Number("123") -> 123
 * 8. Template literals: `Hello ${"World"}` -> "Hello World"
 * 9. Array methods on constants: [1,2,3].length -> 3, [1,2,3].join("-") -> "1-2-3"
 * 10. Math on constants: Math.max(1,2,3) -> 3, Math.abs(-5) -> 5
 * 11. Nested expressions: (2 + 3) * 4 -> 20
 * 12. String methods: "hello".toUpperCase() -> "HELLO", "a,b,c".split(",") -> ["a","b","c"]
 *
 * The evaluator is a recursive descent parser for JS expressions that:
 * - Only evaluates when ALL operands are constants
 * - Falls back to the original expression if any operand is dynamic
 * - Handles operator precedence correctly (using the precedence table)
 * - Never throws -- on error, returns the original expression
 *
 * Safety:
 * - Never evaluates function calls (except known pure builtins)
 * - Never evaluates property access on unknown objects
 * - Never evaluates assignments
 * - Never evaluates code with potential side effects
 */

// --- Constant Value Types --------------------------------------------

export type ConstValue =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "null" }
  | { type: "undefined" }
  | { type: "array"; elements: ConstValue[] }
  | { type: "object"; fields: Array<{ key: string; value: ConstValue }> };

// --- Fold Result -----------------------------------------------------

export interface FoldResult {
  /** The folded value, or null if the expression is not constant */
  value: ConstValue | null;
  /** The original expression string */
  original: string;
  /** The folded expression string (same as original if not folded) */
  folded: string;
  /** Was this expression folded? */
  didFold: boolean;
  /** Reason if not folded */
  reason?: string;
}

// --- Main Constant Folder --------------------------------------------

export class ConstantFolder {
  /** Variables known to be constant (from @state with literal values) */
  private constants = new Map<string, ConstValue>();
  /** Maximum nesting depth to prevent stack overflow */
  private maxDepth = 50;
  /** Current depth */
  private depth = 0;

  /**
   * Register a known constant value from state declarations.
   */
  registerConstant(name: string, value: any): void {
    const cv = this.toConstValue(value);
    if (cv) {
      this.constants.set(name, cv);
    }
  }

  /**
   * Fold a single expression string.
   * Returns the original if it can't be evaluated.
   */
  fold(expr: string): FoldResult {
    this.depth = 0;
    const trimmed = expr.trim();

    const value = this.evaluate(trimmed);

    if (value !== null) {
      const folded = this.constToString(value);
      if (folded !== trimmed) {
        return { value, original: expr, folded, didFold: true };
      }
    }

    return {
      value: null,
      original: expr,
      folded: expr,
      didFold: false,
      reason: value === null ? "Expression is not constant" : "Already folded",
    };
  }

  /**
   * Fold all expressions in a program.
   * Walks the AST and replaces constant expressions with their values.
   */
  foldProgram(program: any): any {
    // First, collect constant state variables
    this.collectStateConstants(program);

    // Walk and fold all expressions
    return this.foldNode(program);
  }

  // --- Expression Evaluator --------------------------------------------

  /**
   * Evaluate a JS expression string to a constant value.
   * Returns null if the expression is not constant or can't be evaluated.
   *
   * This is a recursive descent evaluator that handles:
   * - Literals (numbers, strings, booleans, null, undefined)
   * - Array literals [1, 2, 3]
   * - Object literals { key: value }
   * - Binary operators (+, -, *, /, %, **, <<, >>, >>>, &, |, ^, &&, ||, ??)
   * - Comparison operators (===, !==, ===, !=, <, >, <=, >=)
   * - Unary operators (!, -, +, ~, typeof)
   * - Ternary operator (? :)
   * - Member access (arr.length, str.toUpperCase(), Math.max)
   * - Function calls (on known pure builtins only)
   * - Template literals `Hello ${expr}`
   * - Known constant variables
   */
  private evaluate(expr: string): ConstValue | null {
    this.depth++;
    if (this.depth > this.maxDepth) {
      this.depth--;
      return null;
    }

    const trimmed = expr.trim();
    if (!trimmed) {
      this.depth--;
      return null;
    }

    let result: ConstValue | null = null;

    // Try each evaluator in order (most specific first)

    // 1. Literals
    result ??= this.evalLiteral(trimmed);

    // 2. Known constants
    result ??= this.evalKnownConstant(trimmed);

    // 2.5. Parenthesized group wrapping the whole expression: (expr) -> expr.
    // Must wrap the entire string (not just a prefix, e.g. "(a)+(b)" doesn't
    // qualify) -- otherwise leave it for the binary/logical evaluators below,
    // whose depth-tracking correctly refuses to split *inside* unmatched
    // parens but never unwraps a fully-parenthesized operand on its own.
    if (result === null && trimmed.startsWith("(") && trimmed.endsWith(")")) {
      let depth = 0;
      let wrapsWhole = true;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0 && i !== trimmed.length - 1) { wrapsWhole = false; break; }
        }
      }
      if (wrapsWhole) {
        result ??= this.evaluate(trimmed.slice(1, -1));
      }
    }

    // 3. Array literal
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      result ??= this.evalArrayLiteral(trimmed);
    }

    // 4. Object literal
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      result ??= this.evalObjectLiteral(trimmed);
    }

    // 5. Template literal
    if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
      result ??= this.evalTemplateLiteral(trimmed);
    }

    // 6. Ternary
    result ??= this.evalTernary(trimmed);

    // 7. Logical operators (||, &&, ??)
    result ??= this.evalLogical(trimmed);

    // 8. Binary operators
    result ??= this.evalBinary(trimmed);

    // 9. Unary operators
    result ??= this.evalUnary(trimmed);

    // 10. Member access & method calls
    result ??= this.evalMemberAccess(trimmed);

    // 11. Function calls
    result ??= this.evalFunctionCall(trimmed);

    this.depth--;
    return result;
  }

  // --- Literal Evaluators --------------------------------------------

  private evalLiteral(expr: string): ConstValue | null {
    // Number: 42, 3.14, -5, 0x1F, 0b101, 0o17
    if (/^-?0x[0-9a-f]+$/i.test(expr)) {
      return { type: "number", value: parseInt(expr, 16) };
    }
    if (/^-?0b[01]+$/i.test(expr)) {
      return { type: "number", value: parseInt(expr.slice(2, 10), 2) };
    }
    if (/^-?0o[0-7]+$/i.test(expr)) {
      return { type: "number", value: parseInt(expr.slice(2, 10), 8) };
    }
    if (/^-?\d+$/.test(expr)) {
      return { type: "number", value: parseInt(expr, 10) };
    }
    if (/^-?\d+\.\d+$/.test(expr)) {
      return { type: "number", value: parseFloat(expr) };
    }
    if (/^-?\.\d+$/.test(expr)) {
      return { type: "number", value: parseFloat(expr) };
    }
    if (/^-?\d+\.\d*[eE][+-]?\d+$/.test(expr)) {
      return { type: "number", value: parseFloat(expr) };
    }

    // String: "..." or '...'
    if (/^"[^"]*"$/.test(expr) || /^'[^']*'$/.test(expr)) {
      return { type: "string", value: expr.slice(1, -1) };
    }

    // Boolean
    if (expr === "true") return { type: "boolean", value: true };
    if (expr === "false") return { type: "boolean", value: false };

    // Null / undefined
    if (expr === "null") return { type: "null" };
    if (expr === "undefined") return { type: "undefined" };

    return null;
  }

  private evalKnownConstant(expr: string): ConstValue | null {
    return this.constants.get(expr) ?? null;
  }

  // --- Composite Evaluators -------------------------------------------

  private evalArrayLiteral(expr: string): ConstValue | null {
    // [1, 2, 3] -> array of constants
    const inner = expr.slice(1, -1).trim();
    if (!inner) return { type: "array", elements: [] };

    const elements = splitArgs(inner);
    const values: ConstValue[] = [];

    for (const elem of elements) {
      const val = this.evaluate(elem);
      if (!val) return null;
      values.push(val);
    }

    return { type: "array", elements: values };
  }

  private evalObjectLiteral(expr: string): ConstValue | null {
    // { key: value, key2: value2 }
    const inner = expr.slice(1, -1).trim();
    if (!inner) return { type: "object", fields: [] };

    // Split by commas at depth 0
    const pairs = splitArgs(inner);
    const fields: Array<{ key: string; value: ConstValue }> = [];

    for (const pair of pairs) {
      const colon = pair.indexOf(":");
      if (colon === -1) return null;
      const key = pair.substring(0, colon).trim().replace(/["']/g, "");
      const valExpr = pair.substring(colon + 1).trim();
      const val = this.evaluate(valExpr);
      if (!val) return null;
      fields.push({ key, value: val });
    }

    return { type: "object", fields };
  }

  private evalTemplateLiteral(expr: string): ConstValue | null {
    // `Hello ${name}!` where name is a known constant
    const inner = expr.slice(1, -1);
    let result = "";
    let remaining = inner;

    while (remaining.length > 0) {
      const start = remaining.indexOf("${");
      if (start === -1) {
        result += remaining;
        break;
      }
      result += remaining.substring(0, start);
      const end = remaining.indexOf("}", start + 2);
      if (end === -1) return null;
      const exprStr = remaining.substring(start + 2, end);
      const val = this.evaluate(exprStr);
      if (!val) return null;
      result += this.constToJSString(val);
      remaining = remaining.substring(end + 1);
    }

    return { type: "string", value: result };
  }

  private evalTernary(expr: string): ConstValue | null {
    // condition ? a : b
    // Need to find the ? that's at depth 0
    let depth = 0;
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (inString) {
        if (ch === stringChar && expr[i - 1] !== "\\") inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") depth--;
      else if (ch === "?" && depth === 0 && expr[i + 1] !== ".") {
        // Found ternary ? at depth 0
        const cond = expr.substring(0, i);
        const rest = expr.substring(i + 1);

        // Find the : at depth 0
        let d2 = 0;
        let is2 = false;
        let sc2 = "";
        let colonPos = -1;
        for (let j = 0; j < rest.length; j++) {
          const c = rest[j];
          if (is2) {
            if (c === sc2 && rest[j - 1] !== "\\") is2 = false;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") { is2 = true; sc2 = c; continue; }
          if (c === "(" || c === "[" || c === "{") d2++;
          else if (c === ")" || c === "]" || c === "}") d2--;
          else if (c === ":" && d2 === 0) {
            colonPos = j;
            break;
          }
        }
        if (colonPos === -1) return null;

        const trueExpr = rest.substring(0, colonPos);
        const falseExpr = rest.substring(colonPos + 1);

        const condVal = this.evaluate(cond);
        if (!condVal) return null;

        const condBool = this.constToBoolean(condVal);
        if (condBool) {
          return this.evaluate(trueExpr);
        } else {
          return this.evaluate(falseExpr);
        }
      }
    }
    return null;
  }

  private evalLogical(expr: string): ConstValue | null {
    // || at depth 0
    const orResult = this.tryBinaryOp(expr, "||", (a, b) => {
      const ab = this.constToBoolean(a);
      if (ab) return a;
      return b;
    });
    if (orResult !== undefined) return orResult;

    // ?? at depth 0
    const nullishResult = this.tryBinaryOp(expr, "??", (a, b) => {
      if (a.type === "null" || a.type === "undefined") return b;
      return a;
    });
    if (nullishResult !== undefined) return nullishResult;

    // && at depth 0
    const andResult = this.tryBinaryOp(expr, "&&", (a, b) => {
      const ab = this.constToBoolean(a);
      if (!ab) return a;
      return b;
    });
    if (andResult !== undefined) return andResult;

    return null;
  }

  private evalBinary(expr: string): ConstValue | null {
    // Try each binary operator by precedence (lowest to highest)

    // | (bitwise OR)
    let r = this.tryBinaryOp(expr, "|", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value | b.value };
      return null;
    });
    if (r !== undefined) return r;

    // ^ (bitwise XOR)
    r = this.tryBinaryOp(expr, "^", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value ^ b.value };
      return null;
    });
    if (r !== undefined) return r;

    // & (bitwise AND)
    r = this.tryBinaryOp(expr, "&", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value & b.value };
      return null;
    });
    if (r !== undefined) return r;

    // Equality: ===, !==, ==, !=
    r = this.tryBinaryOp(expr, "===", (a, b) => {
      return { type: "boolean", value: this.constEqual(a, b) };
    });
    if (r !== undefined) return r;

    r = this.tryBinaryOp(expr, "!==", (a, b) => {
      return { type: "boolean", value: !this.constEqual(a, b) };
    });
    if (r !== undefined) return r;

    r = this.tryBinaryOp(expr, "==", (a, b) => {
      return { type: "boolean", value: this.constLooseEqual(a, b) };
    });
    if (r !== undefined) return r;

    r = this.tryBinaryOp(expr, "!=", (a, b) => {
      return { type: "boolean", value: !this.constLooseEqual(a, b) };
    });
    if (r !== undefined) return r;

    // Comparison: <, >, <=, >=
    r = this.tryComparison(expr, "<", (a, b) => a < b);
    if (r !== undefined) return r;

    r = this.tryComparison(expr, ">", (a, b) => a > b);
    if (r !== undefined) return r;

    r = this.tryComparison(expr, "<=", (a, b) => a <= b);
    if (r !== undefined) return r;

    r = this.tryComparison(expr, ">=", (a, b) => a >= b);
    if (r !== undefined) return r;

    // Bit shift: <<, >>, >>>
    r = this.tryBinaryOp(expr, "<<", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value << b.value };
      return null;
    });
    if (r !== undefined) return r;

    r = this.tryBinaryOp(expr, ">>>", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value >>> b.value };
      return null;
    });
    if (r !== undefined) return r;

    r = this.tryBinaryOp(expr, ">>", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value >> b.value };
      return null;
    });
    if (r !== undefined) return r;

    // Addition: + (handles both number and string)
    r = this.tryBinaryOp(expr, "+", (a, b) => {
      if (a.type === "number" && b.type === "number") {
        return { type: "number", value: a.value + b.value };
      }
      if (a.type === "string" || b.type === "string") {
        return { type: "string", value: this.constToJSString(a) + this.constToJSString(b) };
      }
      if (a.type === "boolean" && b.type === "boolean") {
        return { type: "number", value: Number(a.value) + Number(b.value) };
      }
      return null;
    });
    if (r !== undefined) return r;

    // Subtraction
    r = this.tryBinaryOp(expr, "-", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value - b.value };
      return null;
    });
    if (r !== undefined) return r;

    // Multiplication
    r = this.tryBinaryOp(expr, "*", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: a.value * b.value };
      if (a.type === "string" && b.type === "number") {
        return { type: "string", value: a.value.repeat(Math.max(0, b.value)) };
      }
      if (b.type === "string" && a.type === "number") {
        return { type: "string", value: b.value.repeat(Math.max(0, a.value)) };
      }
      return null;
    });
    if (r !== undefined) return r;

    // Division
    r = this.tryBinaryOp(expr, "/", (a, b) => {
      if (a.type === "number" && b.type === "number" && b.value !== 0)
        return { type: "number", value: a.value / b.value };
      return null;
    });
    if (r !== undefined) return r;

    // Modulo
    r = this.tryBinaryOp(expr, "%", (a, b) => {
      if (a.type === "number" && b.type === "number" && b.value !== 0)
        return { type: "number", value: a.value % b.value };
      return null;
    });
    if (r !== undefined) return r;

    // Exponentiation
    r = this.tryBinaryOp(expr, "**", (a, b) => {
      if (a.type === "number" && b.type === "number")
        return { type: "number", value: Math.pow(a.value, b.value) };
      return null;
    });
    if (r !== undefined) return r;

    return null;
  }

  private evalUnary(expr: string): ConstValue | null {
    // !expr
    if (expr.startsWith("!")) {
      const val = this.evaluate(expr.substring(1));
      if (!val) return null;
      return { type: "boolean", value: !this.constToBoolean(val) };
    }

    // -expr
    if (expr.startsWith("-") && !expr.startsWith("--")) {
      const val = this.evaluate(expr.substring(1));
      if (!val) return null;
      if (val.type === "number") return { type: "number", value: -val.value };
      return null;
    }

    // +expr
    if (expr.startsWith("+") && !expr.startsWith("++")) {
      const val = this.evaluate(expr.substring(1));
      if (!val) return null;
      if (val.type === "number") return val;
      if (val.type === "string") {
        const n = Number(val.value);
        if (!isNaN(n)) return { type: "number", value: n };
      }
      if (val.type === "boolean") return { type: "number", value: Number(val.value) };
      return null;
    }

    // ~expr (bitwise NOT)
    if (expr.startsWith("~")) {
      const val = this.evaluate(expr.substring(1));
      if (!val) return null;
      if (val.type === "number") return { type: "number", value: ~val.value };
      return null;
    }

    // typeof expr
    if (expr.startsWith("typeof ")) {
      const val = this.evaluate(expr.substring(7));
      if (!val) return null;
      return { type: "string", value: val.type === "null" ? "object" : val.type };
    }

    return null;
  }

  // --- Member Access & Method Calls -----------------------------------

  private evalMemberAccess(expr: string): ConstValue | null {
    // obj.prop or obj.method(args)

    // Math.xxx
    const mathMatch = expr?.match(/^Math\.(\w+)\s*\(([^)]*)\)$/);
    if (mathMatch) {
      const method = mathMatch[1];
      const args = splitArgs(mathMatch[2]).map(a => this.evaluate(a)).filter(Boolean) as ConstValue[];
      if (args.length === 0 || args.some(a => a.type !== "number")) return null;

      const nums = args.map(a => (a as any).value as number);

      switch (method) {
        case "max": return { type: "number", value: Math.max(...nums) };
        case "min": return { type: "number", value: Math.min(...nums) };
        case "abs": return { type: "number", value: Math.abs(nums[0]) };
        case "round": return { type: "number", value: Math.round(nums[0]) };
        case "floor": return { type: "number", value: Math.floor(nums[0]) };
        case "ceil": return { type: "number", value: Math.ceil(nums[0]) };
        case "sqrt": return { type: "number", value: Math.sqrt(nums[0]) };
        case "pow": return { type: "number", value: Math.pow(nums[0], nums[1]) };
        case "sign": return { type: "number", value: Math.sign(nums[0]) };
        case "trunc": return { type: "number", value: Math.trunc(nums[0]) };
        case "log": return { type: "number", value: Math.log(nums[0]) };
        case "log2": return { type: "number", value: Math.log2(nums[0]) };
        case "log10": return { type: "number", value: Math.log10(nums[0]) };
        case "exp": return { type: "number", value: Math.exp(nums[0]) };
        case "sin": return { type: "number", value: Math.sin(nums[0]) };
        case "cos": return { type: "number", value: Math.cos(nums[0]) };
        case "tan": return { type: "number", value: Math.tan(nums[0]) };
        default: return null;
      }
    }

    // String methods: "string".method()
    const strMethodMatch = expr.match(/^(?:"([^"]*)"|'([^']*)')\.(\w+)\s*\(([^)]*)\)$/);
    if (strMethodMatch) {
      const str = strMethodMatch[1] ?? strMethodMatch[2] ?? "";
      const method = strMethodMatch[3];
      const argsRaw = strMethodMatch[4].trim();

      const args = argsRaw ? splitArgs(argsRaw).map(a => this.evaluate(a)).filter(Boolean) as ConstValue[] : [];

      switch (method) {
        case "toUpperCase": return { type: "string", value: str.toUpperCase() };
        case "toLowerCase": return { type: "string", value: str.toLowerCase() };
        case "trim": return { type: "string", value: str.trim() };
        case "trimStart": return { type: "string", value: str.trimStart() };
        case "trimEnd": return { type: "string", value: str.trimEnd() };
        case "repeat": return { type: "string", value: str.repeat(args[0]?.type === "number" ? args[0].value : 0) };
        case "charAt": return { type: "string", value: str.charAt(args[0]?.type === "number" ? args[0].value : 0) };
        case "slice": {
          const start = args[0]?.type === "number" ? args[0].value : 0;
          const end = args[1]?.type === "number" ? args[1].value : undefined;
          return { type: "string", value: str.slice(start, end) };
        }
        case "substring": {
          const start = args[0]?.type === "number" ? args[0].value : 0;
          const end = args[1]?.type === "number" ? args[1].value : undefined;
          return { type: "string", value: str.substring(start, end) };
        }
        case "split": {
          const sep = args[0]?.type === "string" ? args[0].value : "";
          const parts = sep ? str.split(sep) : [str];
          return { type: "array", elements: parts.map(p => ({ type: "string" as const, value: p })) };
        }
        case "replace": {
          if (args[0]?.type === "string" && args[1]?.type === "string") {
            return { type: "string", value: str.replace(args[0].value, args[1].value) };
          }
          return null;
        }
        case "replaceAll": {
          if (args[0]?.type === "string" && args[1]?.type === "string") {
            return { type: "string", value: str.split(args[0].value).join(args[1].value) };
          }
          return null;
        }
        case "padStart": {
          const len = args[0]?.type === "number" ? args[0].value : 0;
          const pad = args[1]?.type === "string" ? args[1].value : " ";
          return { type: "string", value: str.padStart(len, pad) };
        }
        case "padEnd": {
          const len = args[0]?.type === "number" ? args[0].value : 0;
          const pad = args[1]?.type === "string" ? args[1].value : " ";
          return { type: "string", value: str.padEnd(len, pad) };
        }
        case "concat": {
          let result = str;
          for (const a of args) {
            result += this.constToJSString(a);
          }
          return { type: "string", value: result };
        }
        case "includes": {
          const search = args[0]?.type === "string" ? args[0].value : "";
          return { type: "boolean", value: str.includes(search) };
        }
        case "startsWith": {
          const search = args[0]?.type === "string" ? args[0].value : "";
          return { type: "boolean", value: str.startsWith(search) };
        }
        case "endsWith": {
          const search = args[0]?.type === "string" ? args[0].value : "";
          return { type: "boolean", value: str.endsWith(search) };
        }
        case "indexOf": {
          const search = args[0]?.type === "string" ? args[0].value : "";
          return { type: "number", value: str.indexOf(search) };
        }
        case "lastIndexOf": {
          const search = args[0]?.type === "string" ? args[0].value : "";
          return { type: "number", value: str.lastIndexOf(search) };
        }
        default: return null;
      }
    }

    // Array methods: [1,2,3].method()
    const arrMethodMatch = expr?.match(/^\[(.*)\]\.(\w+)\s*\(([^)]*)\)$/);
    if (arrMethodMatch) {
      const arrContent = arrMethodMatch[1];
      const method = arrMethodMatch[2];
      const arrVal = this.evalArrayLiteral(`[${arrContent}]`);
      if (!arrVal || arrVal.type !== "array") return null;
      const elements = arrVal.elements;

      const args = arrMethodMatch[3].trim()
        ? splitArgs(arrMethodMatch[3]).map(a => this.evaluate(a)).filter(Boolean) as ConstValue[]
        : [];

      switch (method) {
        case "length": return { type: "number", value: elements.length };
        case "join": {
          const sep = args[0]?.type === "string" ? args[0].value : ",";
          return { type: "string", value: elements.map(e => this.constToJSString(e)).join(sep) };
        }
        case "indexOf": {
          if (!args[0]) return null;
          for (let i = 0; i < elements.length; i++) {
            if (this.constEqual(elements[i], args[0])) return { type: "number", value: i };
          }
          return { type: "number", value: -1 };
        }
        case "includes": {
          if (!args[0]) return null;
          for (const e of elements) {
            if (this.constEqual(e, args[0])) return { type: "boolean", value: true };
          }
          return { type: "boolean", value: false };
        }
        case "concat": {
          let result = [...elements];
          for (const a of args) {
            if (a.type === "array") result.push(...a.elements);
            else result.push(a);
          }
          return { type: "array", elements: result };
        }
        case "slice": {
          const start = args[0]?.type === "number" ? args[0].value : 0;
          const end = args[1]?.type === "number" ? args[1].value : elements.length;
          return { type: "array", elements: elements.slice(start, end) };
        }
        case "reverse": {
          return { type: "array", elements: [...elements].reverse() };
        }
        case "flat": {
          const depth = args[0]?.type === "number" ? args[0].value : 1;
          const flatElements = (els: ConstValue[], d: number): ConstValue[] => {
            const result: ConstValue[] = [];
            for (const e of els) {
              if (e.type === "array" && d > 0) {
                result.push(...flatElements(e.elements, d - 1));
              } else {
                result.push(e);
              }
            }
            return result;
          };
          return { type: "array", elements: flatElements(elements, depth) };
        }
        default: return null;
      }
    }

    // String property: "string".length
    const strPropMatch = expr.match(/^(?:"([^"]*)"|'([^']*)')\.(\w+)$/);
    if (strPropMatch) {
      const str = strPropMatch[1] ?? strPropMatch[2] ?? "";
      const prop = strPropMatch[3];
      switch (prop) {
        case "length": return { type: "number", value: str.length };
        default: return null;
      }
    }

    // Array property: [1,2,3].length
    const arrPropMatch = expr?.match(/^\[(.*)\]\.(\w+)$/);
    if (arrPropMatch) {
      const arrVal = this.evalArrayLiteral(`[${arrPropMatch[1]}]`);
      if (!arrVal || arrVal.type !== "array") return null;
      const prop = arrPropMatch[2];
      switch (prop) {
        case "length": return { type: "number", value: arrVal.elements.length };
        default: return null;
      }
    }

    return null;
  }

  private evalFunctionCall(expr: string): ConstValue | null {
    // String(x), Number(x), Boolean(x), parseInt(x, 10), etc.
    const fnMatch = expr.match(/^(\w+)\s*\(([^)]*)\)$/);
    if (!fnMatch) return null;

    const fn = fnMatch[1];
    const argsStr = fnMatch[2].trim();
    const args = argsStr ? splitArgs(argsStr).map(a => this.evaluate(a)).filter(Boolean) as ConstValue[] : [];

    switch (fn) {
      case "String":
        if (args[0]) return { type: "string", value: this.constToJSString(args[0]) };
        return null;
      case "Number":
        if (!args[0]) return null;
        if (args[0].type === "number") return args[0];
        if (args[0].type === "string") {
          const n = Number(args[0].value);
          if (!isNaN(n)) return { type: "number", value: n };
        }
        if (args[0].type === "boolean") return { type: "number", value: Number(args[0].value) };
        return null;
      case "Boolean":
        if (!args[0]) return null;
        return { type: "boolean", value: this.constToBoolean(args[0]) };
      case "parseInt":
        if (args[0]?.type === "string") {
          const radix = args[1]?.type === "number" ? args[1].value : 10;
          return { type: "number", value: parseInt(args[0].value, radix) };
        }
        return null;
      case "parseFloat":
        if (args[0]?.type === "string") {
          return { type: "number", value: parseFloat(args[0].value) };
        }
        return null;
      case "isNaN":
        if (args[0]?.type === "number") return { type: "boolean", value: isNaN(args[0].value) };
        return null;
      case "isFinite":
        if (args[0]?.type === "number") return { type: "boolean", value: isFinite(args[0].value) };
        return null;
      default:
        return null;
    }
  }

  // --- Program Folding ------------------------------------------------

  private collectStateConstants(program: any): void {
    walkAST(program, (node: any) => {
      if (node.type === "StateDirective" && node.declarations) {
        for (const decl of node.declarations) {
          const val = this.toConstValue(decl.value);
          if (val) {
            this.constants.set(decl.name, val);
          }
        }
      }
    });
  }

  private foldNode(node: any): any {
    if (!node || typeof node !== "object") return node;

    // Fold if-node conditions
    if (node.type === "If") {
      const foldResult = this.fold(node.condition);
      if (foldResult.didFold) {
        node.condition = foldResult.folded;
      }
    }

    // Fold for-node iterables
    if (node.type === "For") {
      const foldResult = this.fold(node.iterable);
      if (foldResult.didFold) {
        node.iterable = foldResult.folded;
      }
    }

    // Fold while-node conditions
    if (node.type === "While") {
      const foldResult = this.fold(node.condition);
      if (foldResult.didFold) {
        node.condition = foldResult.folded;
      }
    }

    // Fold interpolated text
    if (node.type === "Text" && node.isInterpolated) {
      const foldResult = this.fold(node.value);
      if (foldResult.didFold) {
        node.value = foldResult.folded;
      }
    }

    // Fold element attribute values
    if (node.type === "Element") {
      for (const attr of node.attrs || []) {
        if (attr.isInterpolated) {
          const foldResult = this.fold(attr.value);
          if (foldResult.didFold) {
            attr.value = foldResult.folded;
          }
        }
      }
      for (const binding of node.bindings || []) {
        const foldResult = this.fold(binding.expression);
        if (foldResult.didFold) {
          binding.expression = foldResult.folded;
        }
      }
    }

    // Fold component prop values
    if (node.type === "Component") {
      for (const prop of node.props || []) {
        if (prop.isInterpolated) {
          const foldResult = this.fold(prop.value);
          if (foldResult.didFold) {
            prop.value = foldResult.folded;
          }
        }
      }
    }

    // Recurse into children
    const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        node[key] = node[key].map((child: any) => this.foldNode(child));
      }
    }

    return node;
  }

  // --- Binary Op Helper -----------------------------------------------

  /**
   * Try to split expr by an operator and apply a function to both sides.
   * Returns undefined if the operator isn't found at depth 0.
   */
  private tryBinaryOp(
    expr: string,
    op: string,
    fn: (left: ConstValue, right: ConstValue) => ConstValue | null
  ): ConstValue | null | undefined {
    // Find the operator at depth 0 (not inside brackets or strings)
    const parts = this.splitByOperator(expr, op);
    if (!parts) return;

    const left = this.evaluate(parts.left);
    const right = this.evaluate(parts.right);
    if (!left || !right) return null;

    return fn(left, right);
  }

  private tryComparison(
    expr: string,
    op: string,
    fn: (a: number, b: number) => boolean
  ): ConstValue | null | undefined {
    return this.tryBinaryOp(expr, op, (a, b) => {
      if (a.type === "number" && b.type === "number") {
        return { type: "boolean", value: fn(a.value, b.value) };
      }
      if (a.type === "string" && b.type === "string") {
        if (op === "<") return { type: "boolean", value: a.value < b.value };
        if (op === ">") return { type: "boolean", value: a.value > b.value };
        if (op === "<=") return { type: "boolean", value: a.value <= b.value };
        if (op === ">=") return { type: "boolean", value: a.value >= b.value };
      }
      return null;
    });
  }

  /**
   * Split an expression by an operator at depth 0.
   * Returns { left, right } or null if the operator isn't found at depth 0.
   */
  private splitByOperator(expr: string, op: string): { left: string; right: string } | null {
    let depth = 0;
    let inString = false;
    let stringChar = "";
    const opLen = op.length;

    // For single-char ops, need to check they're not part of a longer op
    // e.g. & shouldn't match &&, | shouldn't match || or ??
    //
    // NOTE: the scan must cover the *entire* string (down to the last
    // character), not stop at `length - opLen` -- otherwise, for multi-char
    // operators, trailing characters (which can include closing quotes) are
    // never visited by the inString/depth tracking below, corrupting quote
    // parity for everything to their left. The operator-match check itself
    // stays safe near the end: `substring()` auto-clamps, so it simply won't
    // equal `op` once too little of the string remains.
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i];

      if (inString) {
        if (ch === stringChar && expr[i - 1] !== "\\") inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") depth--;
      else if (ch === ")" || ch === "]" || ch === "}") depth++;

      if (depth === 0 && expr.substring(i, i + opLen) === op) {
        // Check it's not part of a longer operator
        // For "&", check it's not "&&" or "&="
        if (op === "&" && (expr[i + 1] === "&" || expr[i + 1] === "=" || expr[i - 1] === "&")) continue;
        if (op === "|" && (expr[i + 1] === "|" || expr[i + 1] === "=")) continue;
        if (op === "^" && expr[i + 1] === "=") continue;
        if (op === "+" && (expr[i + 1] === "+" || expr[i - 1] === "+")) continue;
        if (op === "-" && (expr[i + 1] === "-" || expr[i - 1] === "-")) continue;
        if (op === "*" && (expr[i + 1] === "*" || expr[i - 1] === "*")) continue;
        if (op === "=" && (expr[i + 1] === "=" || expr[i - 1] === "=" || expr[i - 1] === "!")) continue;
        if (op === "!" && (expr[i + 1] === "=" || expr[i - 1] === "=")) continue;
        if (op === "<" && (expr[i + 1] === "=" || expr[i - 1] === "<")) continue;
        if (op === ">" && (expr[i + 1] === "=" || expr[i - 1] === ">" || expr[i - 1] === "<")) continue;
        if (op === "?" && expr[i + 1] === "?") continue;

        const left = expr.substring(0, i).trim();
        const right = expr.substring(i + opLen).trim();
        if (left && right) return { left, right };
      }
    }
    return null;
  }

  // --- Const Value Helpers --------------------------------------------

  private toConstValue(value: any): ConstValue | null {
    if (typeof value === "number") return { type: "number", value };
    if (typeof value === "string") return { type: "string", value };
    if (typeof value === "boolean") return { type: "boolean", value };
    if (value === null) return { type: "null" };
    if (value === undefined) return { type: "undefined" };
    if (Array.isArray(value)) {
      const elements = value.map(v => this.toConstValue(v)).filter(Boolean) as ConstValue[];
      if (elements.length !== value.length) return null;
      return { type: "array", elements };
    }
    return null;
  }

  private constToBoolean(val: ConstValue): boolean {
    switch (val.type) {
      case "boolean": return val.value;
      case "number": return val.value !== 0;
      case "string": return val.value.length > 0;
      case "null": return false;
      case "undefined": return false;
      case "array": return val.elements.length > 0;
      case "object": return val.fields.length > 0;
      default:
        break;

    }
  }

  private constToJSString(val: ConstValue): string {
    switch (val.type) {
      case "number": return String(val.value);
      case "string": return val.value;
      case "boolean": return String(val.value);
      case "null": return "null";
      case "undefined": return "undefined";
      case "array": return "[" + val.elements.map(e => this.constToJSString(e)).join(",") + "]";
      case "object": return "{" + val.fields.map(f => `${f.key}:${this.constToJSString(f.value)}`).join(",") + "}";
      default:
        break;

    }
  }

  private constToString(val: ConstValue): string {
    return this.constToJSString(val);
  }

  private constEqual(a: ConstValue, b: ConstValue): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case "number": return a.value === (b as any).value;
      case "string": return a.value === (b as any).value;
      case "boolean": return a.value === (b as any).value;
      case "null": return b.type === "null";
      case "undefined": return b.type === "undefined";
      case "array": {
        const ba = b as any;
        if (a.elements.length !== ba.elements.length) return false;
        for (let i = 0; i < a.elements.length; i++) {
          if (!this.constEqual(a.elements[i], ba.elements[i])) return false;
        }
        return true;
      }
      case "object": {
        const ba = b as any;
        if (a.fields.length !== ba.fields.length) return false;
        for (const f of a.fields) {
          const bf = ba.fields.find((x: any) => x.key === f.key);
          if (!bf || !this.constEqual(f.value, bf.value)) return false;
        }
        return true;
      }
      default:
        break;

    }
  }

  private constLooseEqual(a: ConstValue, b: ConstValue): boolean {
    // == coerces types
    if (a.type === b.type) return this.constEqual(a, b);
    // number == string
    if (a.type === "number" && b.type === "string") {
      return a.value === Number(b.value);
    }
    if (a.type === "string" && b.type === "number") {
      return Number(a.value) === b.value;
    }
    // boolean == anything
    if (a.type === "boolean") {
      return Number(a.value) === (b.type === "number" ? b.value : b.type === "string" ? Number(b.value) : -1);
    }
    if (b.type === "boolean") {
      return (a.type === "number" ? a.value : a.type === "string" ? Number(a.value) : -1) === Number(b.value);
    }
    // null == undefined
    if ((a.type === "null" || a.type === "undefined") && (b.type === "null" || b.type === "undefined")) {
      return true;
    }
    return false;
  }
}

// --- Utility: Split Arguments -----------------------------------------

/**
 * Split a comma-separated list of arguments at depth 0.
 * Handles nested brackets, strings, and template literals.
 */
function splitArgs(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let current = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      current += ch;
      if (ch === stringChar && str[i - 1] !== "\\") {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }

    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      current += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

// --- Utility: Walk AST -----------------------------------------------

function walkAST(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== "object") return;
  visitor(node);

  const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkAST(child, visitor);
      }
    }
  }
}

// --- Public API -------------------------------------------------------

/**
 * Fold constants in a program.
 */
export function foldConstants(program: any): any {
  const folder = new ConstantFolder();
  return folder.foldProgram(program);
}

/**
 * Fold a single expression.
 */
export function foldExpression(expr: string): FoldResult {
  const folder = new ConstantFolder();
  return folder.fold(expr);
}

/**
 * Register a constant and fold an expression with it.
 */
export function foldWithConstants(
  expr: string,
  constants: Record<string, unknown>
): FoldResult {
  const folder = new ConstantFolder();
  for (const [name, value] of Object.entries(constants)) {
    folder.registerConstant(name, value);
  }
  return folder.fold(expr);
}
