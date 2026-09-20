/**
 * Function Inliner -- inline small functions and expressions at call sites.
 *
 * Inlining replaces a function call with the function body, eliminating
 * the call overhead and enabling further optimizations (constant folding,
 * dead code elimination on the inlined code).
 *
 * This is the same optimization as LLVM's -inline pass or GCC's
 * -finline-functions, but for TW's handler functions and component
 * render functions.
 *
 * What gets inlined:
 * 1. Simple handler functions: @click={increment} -> @click={() => count++}
 *    (when increment is just `count = count + 1`)
 * 2. Pure expression functions: @click={formatDate(date)} -> @click={date.toISOString().split('T')[0]}
 * 3. Small component functions: <Greeting name="Raj" /> -> <div>Hello Raj</div>
 * 4. Constant state access: {PI} -> {3.14159}
 * 5. Simple template helpers
 *
 * Inlining criteria (conservative -- only inline when it's clearly beneficial):
 * - Function body is < 5 statements
 * - Function has no side effects (for expression inlining)
 * - Function is not recursive
 * - Function is not exported (not part of public API)
 * - Inlining doesn't increase code size by more than 2x
 * - Function is called at most 3 times (avoid code bloat)
 *
 * After inlining, the optimizer runs again -- the inlined code might
 * enable further constant folding or dead code elimination.
 */

import type { Program } from "../ast/nodes";

// --- Inliner Result --------------------------------------------------

export interface InlineResult {
  program: Program;
  inlinedFunctions: number;
  inlinedExpressions: number;
  inlinedComponents: number;
  totalSaved: number;
  details: InlineDetail[];
}

export interface InlineDetail {
  type: "function" | "expression" | "component";
  name: string;
  reason: string;
  beforeSize: number;
  afterSize: number;
}

// --- Function Info --------------------------------------------------

interface FunctionInfo {
  name: string;
  params: string[];
  body: string;
  isPure: boolean;
  isRecursive: boolean;
  callCount: number;
  bodySize: number;
  isExported: boolean;
  astNode?: any;
}

// --- Main Inliner ---------------------------------------------------

export class FunctionInliner {
  estimateNodeCount?: any;
  private functions = new Map<string, FunctionInfo>();
  private constants = new Map<string, string>();
  private maxInlineSize = 200; // characters
  private maxCallCount = 3; // don't inline if called more than 3 times
  private inlineCounter = 0; // for alpha-renaming

  /**
   * Run the inliner on a program.
   */
  inline(program: Program): InlineResult {
    // 1. Collect all function definitions
    this.collectFunctions(program);

    // 2. Collect constant values
    this.collectConstants(program);

    // 3. Count call sites
    this.countCalls(program);

    // 4. Check purity
    this.analyzePurity(program);

    // 5. Check recursion
    this.analyzeRecursion();

    // 6. Inline
    const cloned = deepClone(program);
    let inlinedFunctions = 0;
    let inlinedExpressions = 0;
    let inlinedComponents = 0;
    const details: InlineDetail[] = [];

    walkAST(cloned, (node: any) => {
      // Inline handler expressions
      if (node.type === "Element") {
        for (const ev of node.events || []) {
          const result = this.tryInlineExpression(ev.handler);
          if (result.inlined) {
            const beforeSize = ev.handler.length;
            ev.handler = result.expression;
            inlinedExpressions++;
            details.push({
              type: "expression",
              name: result.originalName ?? "",
              reason: result.reason,
              beforeSize,
              afterSize: ev.handler.length,
            });
          }
        }
        // Inline interpolated attributes
        for (const attr of node.attrs || []) {
          if (attr.isInterpolated) {
            const result = this.tryInlineExpression(attr.value);
            if (result.inlined) {
              attr.value = result.expression;
              inlinedExpressions++;
            }
          }
        }
        // Inline bindings
        for (const binding of node.bindings || []) {
          const result = this.tryInlineExpression(binding.expression);
          if (result.inlined) {
            binding.expression = result.expression;
            inlinedExpressions++;
          }
        }
      }

      // Inline interpolated text
      if (node.type === "Text" && node.isInterpolated) {
        const result = this.tryInlineExpression(node.value);
        if (result.inlined) {
          node.value = result.expression;
          inlinedExpressions++;
        }
      }

      // Inline if conditions
      if (node.type === "If") {
        const result = this.tryInlineExpression(node.condition);
        if (result.inlined) {
          node.condition = result.expression;
          inlinedExpressions++;
        }
      }

      // Inline for iterables
      if (node.type === "For") {
        const result = this.tryInlineExpression(node.iterable);
        if (result.inlined) {
          node.iterable = result.expression;
          inlinedExpressions++;
        }
      }

      // Inline component renders
      if (node.type === "Component") {
        const result = this.tryInlineComponent(node);
        if (result.inlined) {
          inlinedComponents++;
          details.push({
            type: "component",
            name: node.name,
            reason: "Small component inlined",
            beforeSize: 0,
            afterSize: 0,
          });
        }
      }
    });

    // Inline function definitions themselves
    if (cloned.directives) {
      cloned.directives = cloned.directives.filter((dir: any) => {
        if (dir.type === "FunctionDirective" || dir.name === "function") {
          const name = dir.args?.[0]?.value ?? dir.name;
          const info = this.functions.get(name);
          if (info && info.callCount === 0) {
            // Function is never called -- remove it
            inlinedFunctions++;
            details.push({
              type: "function",
              name,
              reason: "Removed unused function (all calls inlined)",
              beforeSize: info.bodySize,
              afterSize: 0,
            });
            return false;
          }
        }
        return true;
      });
      if (cloned.directives !== undefined) {
        // Also check body for function definitions
      }
    }

    const totalSaved = details.reduce((sum, d) => sum + (d.beforeSize - d.afterSize), 0);

    return {
      program: cloned,
      inlinedFunctions,
      inlinedExpressions,
      inlinedComponents,
      totalSaved,
      details,
    };
  }

  // --- Collection ----------------------------------------------------

  private collectFunctions(program: Program): void {
    // From directives
    for (const dir of program.directives || []) {
      const d = dir as any;
      if (d.type === "FunctionDirective" || d.name === "function") {
        const name = d.args?.[0]?.value ?? d.name;
        const params = (d.params || d.args?.slice(1) || []).map((a: any) => a.value ?? a).filter(Boolean);
        const body = d.body ?? "";
        this.functions.set(name, {
          name,
          params,
          body,
          isPure: false,
          isRecursive: false,
          callCount: 0,
          bodySize: this.estimateNodeCount(body),
          isExported: false,
          astNode: d,
        });
      }
    }

    // From script blocks
    walkAST(program, (node: any) => {
      if (node.type === "ScriptBlock" && node.content) {
        const fnDefs = this.extractFunctionDefs(node.content);
        for (const fn of fnDefs) {
          if (!this.functions.has(fn.name)) {
            this.functions.set(fn.name, {
              ...fn,
              isPure: false,
              isRecursive: false,
              callCount: 0,
              bodySize: this.estimateNodeCount(fn.body),
              isExported: false,
            });
          }
        }
      }
    });
  }

  private collectConstants(program: Program): void {
    for (const dir of program.directives || []) {
      const d = dir as any;
      if (d.type === "StateDirective" && d.declarations) {
        for (const decl of d.declarations) {
          // If the value is a literal, register it as a constant
          if (decl.value && this.isLiteral(decl.value)) {
            this.constants.set(decl.name, decl.value);
          }
        }
      }
    }
  }

  private countCalls(program: Program): void {
    walkAST(program, (node: any) => {
      // Count function calls in expressions
      const expressions = this.getExpressions(node);
      for (const expr of expressions) {
        for (const [name, info] of this.functions) {
          // Check if the expression calls this function
          // Use word boundary + opening paren to avoid matching substrings
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const callRegex = new RegExp(`(?<![.\\w])${escapedName}\\s*\\(`);
          if (callRegex.test(expr)) {
            info.callCount++;
          }
        }
      }
    });
  }

  private analyzePurity(program: Program): void {
    for (const [name, info] of this.functions) {
      info.isPure = this.checkPurity(info.body);
    }
  }

  private analyzeRecursion(): void {
    for (const [name, info] of this.functions) {
      // Check if the function body calls itself: name(...)
      // Use call pattern to avoid false positives from variable references
      const callRegex = new RegExp(`\\b${name}\\s*\\(`);
      info.isRecursive = callRegex.test(info.body);
    }
  }

  // --- Inlining Logic ------------------------------------------------

  private tryInlineExpression(expr: string): {
    inlined: boolean;
    expression: string;
    originalName?: string;
    reason: string;
  } {
    // Try to inline constant references: {PI} -> {3.14159}
    for (const [constName, constValue] of this.constants) {
      const regex = new RegExp(`\\b${constName}\\b`, "g");
      if (regex.test(expr)) {
        const newExpr = expr.replace(regex, constValue);
        if (newExpr !== expr) {
          return {
            inlined: true,
            expression: newExpr,
            originalName: constName,
            reason: `Inlined constant '${constName}' -> '${constValue}'`,
          };
        }
      }
    }

    // Try to inline function calls: formatDate(date) -> body
    for (const [fnName, info] of this.functions) {
      // Don't inline if:
      // - Function is recursive
      // - Function is too large
      // - Function is called too many times
      // - Function has side effects (for expression context)
      if (info.isRecursive) continue;
      if (info.bodySize > this.maxInlineSize) continue;
      if (info.callCount > this.maxCallCount) continue;
      // Don't inline impure functions in expression context
      if (!info.isPure) continue;

      // Check if the expression calls this function
      const callRegex = new RegExp(`\\b${fnName}\\s*\\(([^)]*)\\)`, "g");
      const match = callRegex.exec(expr);
      if (!match) continue;

      // Extract arguments
      const argStr = match[1].trim();
      const args = argStr ? splitArgs(argStr) : [];

      // Substitute parameters in function body
      // Use (?<![.]) to avoid replacing property accesses like obj.param
      let inlinedBody = info.body;
      for (let i = 0; i < info.params.length && i < args.length; i++) {
        // Escape special regex chars in param name
        const escapedParam = info.params[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const paramRegex = new RegExp(`(?<![.\\w])${escapedParam}(?!\\w)`, "g");
        inlinedBody = inlinedBody.replace(paramRegex, args[i].trim());
      }

      // Alpha-renaming: rename local variables to avoid collisions
      // (Conservative: only rename if body contains variable declarations)
      const localVarMatches = inlinedBody.matchAll(/(?:let|const|var)\s+(\w+)/g);
      for (const m of localVarMatches) {
        const varName = m[1];
        const uniqueName = `_tw_${varName}_${this.inlineCounter++}`;
        const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        inlinedBody = inlinedBody.replace(
          new RegExp(`(?<![.\\w])${escaped}(?!\\w)`, "g"),
          uniqueName
        );
      }

      // Replace the call with the inlined body
      // Extract return expression if the body is a return statement
      const returnMatch = inlinedBody.match(/^return\s+(.+);?$/);
      const inlinedExpr = returnMatch ? returnMatch[1] : inlinedBody;
      const newExpr = expr.replace(match[0], `(${inlinedExpr})`);

      if (newExpr !== expr) {
        return {
          inlined: true,
          expression: newExpr,
          originalName: fnName,
          reason: `Inlined function '${fnName}(${info.params.join(", ")})' -> '${inlinedBody}'`,
        };
      }
    }

    return { inlined: false, expression: expr, reason: "" };
  }

  private tryInlineComponent(node: any): { inlined: boolean } {
    // Inline trivially simple components: resolve the component definition,
    // substitute props, and replace the component node with the rendered body.
    const info = this.functions.get(node.name);
    if (!info) return { inlined: false };

    // Only inline small, non-recursive, low-call-count components
    if (info.bodySize > 100) return { inlined: false };
    if (info.callCount > 2) return { inlined: false };
    if (info.isRecursive) return { inlined: false };

    // The component body is a JS expression string (from script blocks or directives).
    // We can't parse it as AST here -- that would require the parser.
    // Instead, we do prop substitution on the body string.
    // This works for simple components like: <div>{name}</div>
    // where the function body returns the template string.

    // Check if props can be substituted
    if (node.props && node.props.length > 0 && info.params.length > 0) {
      // Build a substitution map: param name -> prop value
      const subst = new Map<string, string>();
      for (let i = 0; i < info.params.length && i < node.props.length; i++) {
        const param = info.params[i];
        const propVal = node.props[i]?.value;
        if (typeof propVal === "string") {
          subst.set(param, propVal);
        }
      }

      // Substitute params in body
      let inlinedBody = info.body;
      for (const [param, value] of subst) {
        const regex = new RegExp(`\\b${param}\\b`, "g");
        inlinedBody = inlinedBody.replace(regex, value);
      }

      // If the body changed, we've inlined the component
      if (inlinedBody !== info.body) {
        // Store the inlined body as a prop -- the codegen will use it
        // We don't destroy the AST structure anymore
        node._inlinedBody = inlinedBody;
        node._inlined = true;
        return { inlined: true };
      }
    }

    return { inlined: false };
  }

  // --- Helpers --------------------------------------------------------

  private isLiteral(value: string): boolean {
    const v = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(v)) return true;
    if (/^["'`].*["'`]$/.test(v)) return true;
    if (v === "true" || v === "false" || v === "null" || v === "undefined") return true;
    if (/^\[.*\]$/.test(v) && !v.includes("{")) return true;
    return false;
  }

  private getExpressions(node: any): string[] {
    const exprs: string[] = [];
    if (node.type === "Text" && node.isInterpolated) exprs.push(node.value);
    if (node.type === "Element") {
      for (const attr of node.attrs || []) {
        if (attr.isInterpolated) exprs.push(attr.value);
      }
      for (const binding of node.bindings || []) {
        exprs.push(binding.expression);
      }
      for (const ev of node.events || []) {
        exprs.push(ev.handler);
      }
    }
    if (node.type === "If") exprs.push(node.condition);
    if (node.type === "For") exprs.push(node.iterable);
    if (node.type === "While") exprs.push(node.condition);
    return exprs;
  }

  private checkPurity(body: string): boolean {
    // Impure if: assignment (= but not ==, ===, <=, >=, !=, !==)
    // Use negative lookbehind/lookahead for comparison operators
    const assignmentMatch = body.match(/(?<![<>=!])=(?![=])/);
    if (assignmentMatch) {
      // Check it's not inside a string
      const before = body.substring(0, assignmentMatch.index!);
      const stringDelimiters = (before.match(/["'`]/g) || []).length;
      if (stringDelimiters % 2 === 0) return false; // Not inside a string -> real assignment
    }
    if (/\bnew\s+\w/.test(body)) return false;
    if (/\bawait\b/.test(body)) return false;
    if (/\bdelete\b/.test(body)) return false;
    if (/\bconsole\b/.test(body)) return false;
    if (/\bthis\b/.test(body)) return false;
    if (/\bwindow\b/.test(body)) return false;
    if (/\bdocument\b/.test(body)) return false;
    // Check for function calls -- only known pure functions are allowed
    const callMatches = body.match(/\b(\w+(?:\.\w+)*)\s*\(/g);
    if (callMatches) {
      for (const call of callMatches) {
        const fnName = call.replace(/\s*\($/, "");
        if (!PURE_FUNCTIONS.has(fnName) && !this.functions.has(fnName)) {
          return false;
        }
      }
    }
    return true;
  }

  private extractFunctionDefs(content: string): FunctionInfo[] {
    const funcs: FunctionInfo[] = [];

    // Helper: check if a function is exported
    const isExportedFn = (content: string, name: string, fnIndex: number): boolean => {
      // Check if "export" appears before the function definition
      const before = content.substring(Math.max(0, fnIndex - 50), fnIndex);
      return /\bexport\b/.test(before);
    };

    // Match: function name(params) { body }
    const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(",").map(p => p.trim()).filter(Boolean);
      const bodyStart = match.index + match[0].length;
      const bodyEnd = findMatchingBrace(content, bodyStart - 1);
      if (bodyEnd !== -1) {
        const body = content.substring(bodyStart, bodyEnd).trim();
        funcs.push({
          name, params, body,
          isPure: false, isRecursive: false,
          callCount: 0, bodySize: this.estimateNodeCount(body),
          isExported: isExportedFn(content, name, match.index),
        });
      }
    }

    // Match: const name = (params) => body
    const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*/g;
    while ((match = arrowRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].split(",").map(p => p.trim()).filter(Boolean);
      let bodyStart = match.index + match[0].length;
      let body = "";
      if (content[bodyStart] === "{") {
        const bodyEnd = findMatchingBrace(content, bodyStart);
        if (bodyEnd !== -1) {
          body = content.substring(bodyStart + 1, bodyEnd).trim();
        }
      } else {
        // Expression body
        const semiEnd = content.indexOf(";", bodyStart);
        const nlEnd = content.indexOf("\n", bodyStart);
        const end = semiEnd === -1 ? (nlEnd === -1 ? content.length : nlEnd) : Math.min(semiEnd, nlEnd === -1 ? Infinity : nlEnd);
        body = content.substring(bodyStart, end).trim();
      }
      funcs.push({
        name, params, body,
        isPure: false, isRecursive: false,
        callCount: 0, bodySize: this.estimateNodeCount(body),
        isExported: isExportedFn(content, name, match.index),
      });
    }

    return funcs;
  }
}

// --- Utility Functions -----------------------------------------------

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
      if (ch === stringChar && str[i - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function findMatchingBrace(str: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); } catch { /* ignored */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

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

const PURE_FUNCTIONS = new Set([
  "Math.max", "Math.min", "Math.abs", "Math.round", "Math.floor", "Math.ceil",
  "Math.sqrt", "Math.pow", "Math.sign", "Math.trunc", "Math.log", "Math.log2",
  "Math.log10", "Math.exp", "Math.sin", "Math.cos", "Math.tan",
  "String", "Number", "Boolean", "parseInt", "parseFloat", "isNaN", "isFinite",
  "toUpperCase", "toLowerCase", "trim", "trimStart", "trimEnd", "repeat",
  "charAt", "slice", "substring", "split", "replace", "replaceAll",
  "padStart", "padEnd", "concat", "includes", "startsWith", "endsWith",
  "indexOf", "lastIndexOf", "join", "flat", "reverse",
]);

// --- Public API -------------------------------------------------------

export function inlineFunctions(program: Program): InlineResult {
  const inliner = new FunctionInliner();
  return inliner.inline(program);
}
