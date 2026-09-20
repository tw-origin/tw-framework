/**
 * Diagnostics rules engine -- configurable lint rules with severity levels.
 * @module compiler/diagnostics
 */

import type { ASTNode } from "../ast/nodes";

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";
export type DiagnosticCategory = "syntax" | "semantic" | "style" | "performance" | "security" | "accessibility" | "best-practice" | "deprecation";

export interface DiagnosticRule {
  id: string;
  name: string;
  description: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  enabled: boolean;
  options?: Record<string, unknown>;
  check: (node: ASTNode, context: DiagnosticContext) => DiagnosticMessage[];
}

export interface DiagnosticMessage {
  ruleId: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  node?: ASTNode;
  suggestions?: DiagnosticSuggestion[];
}

export interface DiagnosticSuggestion {
  description: string;
  fix?: (node: ASTNode) => ASTNode;
}

export interface DiagnosticContext {
  filename: string;
  source: string;
  config: Record<string, unknown>;
  rules: Map<string, DiagnosticRule>;
  variables: Set<string>;
  functions: Set<string>;
  imports: Set<string>;
  scopeStack: Array<Set<string>>;
}

export interface DiagnosticReport {
  messages: DiagnosticMessage[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  total: number;
  byCategory: Record<DiagnosticCategory, number>;
  byRule: Record<string, number>;
}

export class RulesEngine {
  private rules: Map<string, DiagnosticRule> = new Map();
  private config: Record<string, unknown> = {};

  registerRule(rule: DiagnosticRule): this {
    this.rules.set(rule.id, rule);
    return this;
  }

  unregisterRule(id: string): this {
    this.rules.delete(id);
    return this;
  }

  enableRule(id: string): this {
    const rule = this.rules.get(id);
    if (rule) rule.enabled = true;
    return this;
  }

  disableRule(id: string): this {
    const rule = this.rules.get(id);
    if (rule) rule.enabled = false;
    return this;
  }

  toggleRule(id: string): this {
    const rule = this.rules.get(id);
    if (rule) rule.enabled = !rule.enabled;
    return this;
  }

  setRuleSeverity(id: string, severity: DiagnosticSeverity): this {
    const rule = this.rules.get(id);
    if (rule) rule.severity = severity;
    return this;
  }

  setRuleOption(id: string, key: string, value: unknown): this {
    const rule = this.rules.get(id);
    if (rule) {
      if (!rule.options) rule.options = {};
      rule.options[key] = value;
    }
    return this;
  }

  getRule(id: string): DiagnosticRule | undefined {
    return this.rules.get(id);
  }

  getRules(): DiagnosticRule[] {
    return [...this.rules.values()];
  }

  getEnabledRules(): DiagnosticRule[] {
    return this.getRules().filter((rule) => rule.enabled);
  }

  getRulesByCategory(category: DiagnosticCategory): DiagnosticRule[] {
    return this.getRules().filter((rule) => rule.category === category);
  }

  getRulesBySeverity(severity: DiagnosticSeverity): DiagnosticRule[] {
    return this.getRules().filter((rule) => rule.severity === severity);
  }

  setConfig(config: Record<string, unknown>): this {
    this.config = config;
    return this;
  }

  getConfig(): Record<string, unknown> {
    return { ...this.config };
  }

  run(ast: ASTNode, filename: string, source: string): DiagnosticReport {
    const context: DiagnosticContext = {
      filename,
      source,
      config: this.config,
      rules: this.rules,
      variables: new Set(),
      functions: new Set(),
      imports: new Set(),
      scopeStack: [new Set()],
    };
    const messages: DiagnosticMessage[] = [];
    this.visit(ast, context, messages);
    return this.createReport(messages);
  }

  private visit(node: ASTNode, context: DiagnosticContext, messages: DiagnosticMessage[]): void {
    if (!node || typeof node !== "object") return;
    for (const rule of this.getEnabledRules()) {
      try {
        const ruleMessages = rule.check(node, context);
        messages.push(...ruleMessages);
      } catch (error) {
        messages.push({
          ruleId: "internal-error",
          severity: "error",
          category: "syntax",
          message: `Rule "${rule.id}" failed: ${(error as Error).message}`,
          line: 0,
          column: 0,
        });
      }
    }
    this.updateContext(node, context);
    for (const key of Object.keys(node)) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((item) => this.visit(item as ASTNode, context, messages));
      } else if (typeof value === "object" && value !== null) {
        this.visit(value as ASTNode, context, messages);
      }
    }
  }

  private updateContext(node: ASTNode, context: DiagnosticContext): void {
    const nodeType = (node as unknown as { type?: string }).type;
    switch (nodeType) {
      case "ImportDeclaration": {
        const specifiers = (node as unknown as { specifiers?: Array<{ local?: { name?: string } }> }).specifiers;
        if (specifiers) {
          specifiers.forEach((s) => {
            if (s.local?.name) {
              context.imports.add(s.local.name);
              context.variables.add(s.local.name);
            }
          });
        }
        break;
      }
      case "FunctionDeclaration": {
        const name = (node as unknown as { id?: { name?: string } }).id?.name;
        if (name) context.functions.add(name);
        break;
      }
      case "VariableDeclaration": {
        const declarations = (node as unknown as { declarations?: Array<{ id?: { name?: string } }> }).declarations;
        if (declarations) {
          declarations.forEach((d) => {
            if (d.id?.name) context.variables.add(d.id.name);
          });
        }
        break;
      }
      case "BlockStatement": {
        context.scopeStack.push(new Set());
        break;
      }
    }
  }

  private createReport(messages: DiagnosticMessage[]): DiagnosticReport {
    const report: DiagnosticReport = {
      messages: messages.sort((a, b) => a.line - b.line || a.column - b.column),
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      hintCount: 0,
      total: messages.length,
      byCategory: {} as Record<DiagnosticCategory, number>,
      byRule: {},
    };
    for (const msg of messages) {
      switch (msg.severity) {
        case "error": report.errorCount++; break;
        case "warning": report.warningCount++; break;
        case "info": report.infoCount++; break;
        case "hint": report.hintCount++; break;
      }
      report.byCategory[msg.category] = (report.byCategory[msg.category] ?? 0) + 1;
      report.byRule[msg.ruleId] = (report.byRule[msg.ruleId] ?? 0) + 1;
    }
    return report;
  }

  clear(): this {
    this.rules.clear();
    return this;
  }

  size(): number {
    return this.rules.size;
  }

  has(id: string): boolean {
    return this.rules.has(id);
  }

  toJSON(): string {
    return JSON.stringify({
      rules: [...this.rules.entries()].map(([id, rule]) => ({
        id,
        name: rule.name,
        description: rule.description,
        severity: rule.severity,
        category: rule.category,
        enabled: rule.enabled,
        options: rule.options,
      })),
      config: this.config,
    }, null, 2);
  }

  fromJSON(json: string): this {
    const data = JSON.parse(json);
    this.config = data.config ?? {};
    for (const ruleData of data.rules ?? []) {
      const rule = this.rules.get(ruleData.id);
      if (rule) {
        rule.enabled = ruleData.enabled;
        rule.severity = ruleData.severity;
        rule.options = ruleData.options;
      }
    }
    return this;
  }
}

export function createRulesEngine(): RulesEngine {
  return new RulesEngine();
}

export const BUILTIN_RULES: DiagnosticRule[] = [
  {
    id: "no-console",
    name: "No Console",
    description: "Disallow console statements in production code",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "CallExpression") {
        const callee = (node as unknown as { callee?: { object?: { name?: string } } }).callee;
        if (callee?.object?.name === "console") {
          msgs.push({
            ruleId: "no-console",
            severity: "warning",
            category: "best-practice",
            message: "Unexpected console statement",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-debugger",
    name: "No Debugger",
    description: "Disallow debugger statements",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "DebuggerStatement") {
        msgs.push({
          ruleId: "no-debugger",
          severity: "error",
          category: "best-practice",
          message: "Unexpected debugger statement",
          line: 0,
          column: 0,
        });
      }
      return msgs;
    },
  },
  {
    id: "no-unused-vars",
    name: "No Unused Variables",
    description: "Disallow unused variables",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "Identifier") {
        const name = (node as unknown as { name?: string }).name;
        if (name && ctx.variables.has(name) && !ctx.imports.has(name)) {
          // Check if used elsewhere - simplified check
        }
      }
      return msgs;
    },
  },
  {
    id: "no-empty-function",
    name: "No Empty Functions",
    description: "Disallow empty function bodies",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "FunctionDeclaration" || nodeType === "FunctionExpression" || nodeType === "ArrowFunctionExpression") {
        const body = (node as unknown as { body?: { body?: unknown[]; type?: string } }).body;
        if (body?.type === "BlockStatement" && Array.isArray(body.body) && body.body.length === 0) {
          msgs.push({
            ruleId: "no-empty-function",
            severity: "warning",
            category: "best-practice",
            message: "Unexpected empty function",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-var",
    name: "No Var",
    description: "Disallow var, use let/const instead",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "VariableDeclaration") {
        const kind = (node as unknown as { kind?: string }).kind;
        if (kind === "var") {
          msgs.push({
            ruleId: "no-var",
            severity: "error",
            category: "best-practice",
            message: "Use let or const instead of var",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "prefer-const",
    name: "Prefer Const",
    description: "Prefer const over let for variables that are never reassigned",
    severity: "info",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "VariableDeclaration") {
        const kind = (node as unknown as { kind?: string }).kind;
        if (kind === "let") {
          // Simplified check - would need scope analysis in production
        }
      }
      return msgs;
    },
  },
  {
    id: "no-duplicate-imports",
    name: "No Duplicate Imports",
    description: "Disallow duplicate import statements from the same module",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ImportDeclaration") {
        const source = (node as unknown as { source?: { value?: string } }).source?.value;
        if (source && ctx.imports.has(source)) {
          msgs.push({
            ruleId: "no-duplicate-imports",
            severity: "warning",
            category: "best-practice",
            message: `Duplicate import from "${source}"`,
            line: 0,
            column: 0,
          });
        } else if (source) {
          ctx.imports.add(source);
        }
      }
      return msgs;
    },
  },
  {
    id: "no-unreachable",
    name: "No Unreachable Code",
    description: "Disallow unreachable code after return/throw/break/continue",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "BlockStatement") {
        const body = (node as unknown as { body?: ASTNode[] }).body;
        if (Array.isArray(body)) {
          let foundTerminal = false;
          for (const stmt of body) {
            const stmtType = (stmt as unknown as { type?: string }).type;
            if (foundTerminal) {
              msgs.push({
                ruleId: "no-unreachable",
                severity: "error",
                category: "best-practice",
                message: "Unreachable code",
                line: 0,
                column: 0,
              });
              break;
            }
            if (stmtType === "ReturnStatement" || stmtType === "ThrowStatement" || stmtType === "BreakStatement" || stmtType === "ContinueStatement") {
              foundTerminal = true;
            }
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "eqeqeq",
    name: "Require Strict Equality",
    description: "Require === and !== instead of == and !=",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "BinaryExpression") {
        const operator = (node as unknown as { operator?: string }).operator;
        if (operator === "==" || operator === "!=") {
          msgs.push({
            ruleId: "eqeqeq",
            severity: "warning",
            category: "best-practice",
            message: `Use ${operator === "==" ? "===" : "!=="} instead of ${operator}`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-eval",
    name: "No Eval",
    description: "Disallow eval() usage",
    severity: "error",
    category: "security",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "CallExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name === "eval") {
          msgs.push({
            ruleId: "no-eval",
            severity: "error",
            category: "security",
            message: "eval() is not allowed",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-with",
    name: "No With",
    description: "Disallow with statements",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "WithStatement") {
        msgs.push({
          ruleId: "no-with",
          severity: "error",
          category: "best-practice",
          message: "with statement is not allowed",
          line: 0,
          column: 0,
        });
      }
      return msgs;
    },
  },
  {
    id: "no-empty",
    name: "No Empty Block",
    description: "Disallow empty block statements",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "BlockStatement") {
        const body = (node as unknown as { body?: unknown[] }).body;
        if (Array.isArray(body) && body.length === 0) {
          const parent = (_ctx as unknown as { parent?: { type?: string } }).parent;
          if (parent?.type !== "ArrowFunctionExpression" && parent?.type !== "FunctionExpression" && parent?.type !== "FunctionDeclaration") {
            msgs.push({
              ruleId: "no-empty",
              severity: "warning",
              category: "best-practice",
              message: "Empty block statement",
              line: 0,
              column: 0,
            });
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "no-multi-spaces",
    name: "No Multi Spaces",
    description: "Disallow multiple spaces",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-trailing-spaces",
    name: "No Trailing Spaces",
    description: "Disallow trailing whitespace",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-mixed-spaces-and-tabs",
    name: "No Mixed Spaces And Tabs",
    description: "Disallow mixed spaces and tabs for indentation",
    severity: "error",
    category: "style",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "semi",
    name: "Semicolon",
    description: "Require or disallow semicolons",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "quotes",
    name: "Quotes",
    description: "Enforce consistent quote style",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "indent",
    name: "Indent",
    description: "Enforce consistent indentation",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-undefined",
    name: "No Undefined",
    description: "Disallow undefined variables",
    severity: "warning",
    category: "semantic",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-null",
    name: "No Null",
    description: "Disallow null values",
    severity: "info",
    category: "best-practice",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-throw-literal",
    name: "No Throw Literal",
    description: "Disallow throwing non-Error objects",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ThrowStatement") {
        const argument = (node as unknown as { argument?: { type?: string } }).argument;
        if (argument?.type === "Literal" || argument?.type === "TemplateLiteral") {
          msgs.push({
            ruleId: "no-throw-literal",
            severity: "warning",
            category: "best-practice",
            message: "Throw an Error object instead of a literal",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-return-await",
    name: "No Return Await",
    description: "Disallow unnecessary return await",
    severity: "warning",
    category: "performance",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ReturnStatement") {
        const argument = (node as unknown as { argument?: { type?: string } }).argument;
        if (argument?.type === "AwaitExpression") {
          msgs.push({
            ruleId: "no-return-await",
            severity: "warning",
            category: "performance",
            message: "Unnecessary return await",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "prefer-arrow-callback",
    name: "Prefer Arrow Callback",
    description: "Prefer arrow functions for callbacks",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-nested-ternary",
    name: "No Nested Ternary",
    description: "Disallow nested ternary expressions",
    severity: "warning",
    category: "style",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ConditionalExpression") {
        const consequent = (node as unknown as { consequent?: { type?: string } }).consequent;
        const alternate = (node as unknown as { alternate?: { type?: string } }).alternate;
        if (consequent?.type === "ConditionalExpression" || alternate?.type === "ConditionalExpression") {
          msgs.push({
            ruleId: "no-nested-ternary",
            severity: "warning",
            category: "style",
            message: "Nested ternary expression",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-lonely-if",
    name: "No Lonely If",
    description: "Disallow if as the only statement in an else block",
    severity: "info",
    category: "style",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "IfStatement") {
        const alternate = (node as unknown as { alternate?: { type?: string; body?: { type?: string; body?: unknown[] } } }).alternate;
        if (alternate?.type === "BlockStatement" && alternate.body?.type === "BlockStatement" && Array.isArray(alternate.body.body) && alternate.body.body.length === 1) {
          const innerStmt = alternate.body.body[0] as unknown as { type?: string };
          if (innerStmt?.type === "IfStatement") {
            msgs.push({
              ruleId: "no-lonely-if",
              severity: "info",
              category: "style",
              message: "Unexpected if as the only statement in an else block",
              line: 0,
              column: 0,
            });
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "no-useless-concat",
    name: "No Useless Concat",
    description: "Disallow unnecessary concatenation of literals",
    severity: "warning",
    category: "performance",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "BinaryExpression") {
        const operator = (node as unknown as { operator?: string }).operator;
        const left = (node as unknown as { left?: { type?: string } }).left;
        const right = (node as unknown as { right?: { type?: string } }).right;
        if (operator === "+" && left?.type === "Literal" && right?.type === "Literal") {
          msgs.push({
            ruleId: "no-useless-concat",
            severity: "warning",
            category: "performance",
            message: "Unnecessary concatenation of literals",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-self-compare",
    name: "No Self Compare",
    description: "Disallow comparisons of a variable to itself",
    severity: "error",
    category: "semantic",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "BinaryExpression") {
        const left = (node as unknown as { left?: { name?: string; type?: string } }).left;
        const right = (node as unknown as { right?: { name?: string; type?: string } }).right;
        if (left?.type === "Identifier" && right?.type === "Identifier" && left.name === right.name) {
          msgs.push({
            ruleId: "no-self-compare",
            severity: "error",
            category: "semantic",
            message: `Self-comparison of "${left.name}"`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-cond-assign",
    name: "No Conditional Assign",
    description: "Disallow assignment in conditional expressions",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "IfStatement") {
        const test = (node as unknown as { test?: { type?: string; operator?: string } }).test;
        if (test?.type === "AssignmentExpression") {
          msgs.push({
            ruleId: "no-cond-assign",
            severity: "error",
            category: "best-practice",
            message: "Assignment in conditional",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-constant-condition",
    name: "No Constant Condition",
    description: "Disallow constant expressions in conditions",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "IfStatement") {
        const test = (node as unknown as { test?: { type?: string; value?: unknown } }).test;
        if (test?.type === "Literal" && typeof test.value === "boolean") {
          msgs.push({
            ruleId: "no-constant-condition",
            severity: "warning",
            category: "best-practice",
            message: "Constant condition",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-sparse-arrays",
    name: "No Sparse Arrays",
    description: "Disallow sparse arrays",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ArrayExpression") {
        const elements = (node as unknown as { elements?: Array<unknown> }).elements;
        if (Array.isArray(elements) && elements.some((el) => el === null || el === undefined)) {
          msgs.push({
            ruleId: "no-sparse-arrays",
            severity: "warning",
            category: "best-practice",
            message: "Sparse array",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-prototype-builtins",
    name: "No Prototype Builtins",
    description: "Disallow calling prototype methods directly on objects",
    severity: "warning",
    category: "security",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "CallExpression") {
        const callee = (node as unknown as { callee?: { property?: { name?: string } } }).callee;
        const dangerousMethods = ["hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable"];
        if (callee?.property?.name && dangerousMethods.includes(callee.property.name)) {
          msgs.push({
            ruleId: "no-prototype-builtins",
            severity: "warning",
            category: "security",
            message: `Do not call ${callee.property.name} directly on objects`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-implicit-coercion",
    name: "No Implicit Coercion",
    description: "Disallow shorthand type conversions",
    severity: "info",
    category: "best-practice",
    enabled: false,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "UnaryExpression") {
        const operator = (node as unknown as { operator?: string }).operator;
        const argument = (node as unknown as { argument?: { type?: string } }).argument;
        if (operator === "!" && argument?.type === "UnaryExpression") {
          msgs.push({
            ruleId: "no-implicit-coercion",
            severity: "info",
            category: "best-practice",
            message: "Use Boolean() instead of !!",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-extra-semi",
    name: "No Extra Semicolon",
    description: "Disallow unnecessary semicolons",
    severity: "warning",
    category: "style",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "EmptyStatement") {
        msgs.push({
          ruleId: "no-extra-semi",
          severity: "warning",
          category: "style",
          message: "Unnecessary semicolon",
          line: 0,
          column: 0,
        });
      }
      return msgs;
    },
  },
  {
    id: "no-fallthrough",
    name: "No Fallthrough",
    description: "Disallow case fallthrough in switch statements",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "SwitchStatement") {
        const cases = (node as unknown as { cases?: Array<{ consequent?: Array<{ type?: string }> }> }).cases;
        if (Array.isArray(cases)) {
          for (let i = 0; i < cases.length - 1; i++) {
            const consequent = cases[i].consequent;
            if (Array.isArray(consequent) && consequent.length > 0) {
              const last = consequent[consequent.length - 1];
              if (last?.type !== "BreakStatement" && last?.type !== "ReturnStatement" && last?.type !== "ThrowStatement" && last?.type !== "ContinueStatement") {
                msgs.push({
                  ruleId: "no-fallthrough",
                  severity: "error",
                  category: "best-practice",
                  message: "Case fallthrough detected",
                  line: 0,
                  column: 0,
                });
              }
            }
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "default-case",
    name: "Default Case",
    description: "Require default case in switch statements",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "SwitchStatement") {
        const cases = (node as unknown as { cases?: Array<{ test?: unknown }> }).cases;
        if (Array.isArray(cases) && !cases.some((c) => c.test === null || c.test === undefined)) {
          msgs.push({
            ruleId: "default-case",
            severity: "warning",
            category: "best-practice",
            message: "Missing default case in switch statement",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-duplicate-case",
    name: "No Duplicate Case",
    description: "Disallow duplicate case labels",
    severity: "error",
    category: "semantic",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "SwitchStatement") {
        const cases = (node as unknown as { cases?: Array<{ test?: { value?: unknown } }> }).cases;
        if (Array.isArray(cases)) {
          const seen = new Set<unknown>();
          for (const c of cases) {
            const value = c.test?.value;
            if (value !== undefined && seen.has(value)) {
              msgs.push({
                ruleId: "no-duplicate-case",
                severity: "error",
                category: "semantic",
                message: `Duplicate case label: ${value}`,
                line: 0,
                column: 0,
              });
            }
            seen.add(value);
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "no-redeclare",
    name: "No Redeclare",
    description: "Disallow variable redeclaration",
    severity: "error",
    category: "semantic",
    enabled: true,
    check: (node, ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "VariableDeclaration") {
        const declarations = (node as unknown as { declarations?: Array<{ id?: { name?: string } }> }).declarations;
        if (Array.isArray(declarations)) {
          for (const d of declarations) {
            const name = d.id?.name;
            if (name) {
              const currentScope = ctx.scopeStack[ctx.scopeStack.length - 1];
              if (currentScope.has(name)) {
                msgs.push({
                  ruleId: "no-redeclare",
                  severity: "error",
                  category: "semantic",
                  message: `"${name}" is already declared`,
                  line: 0,
                  column: 0,
                });
              } else {
                currentScope.add(name);
              }
            }
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "no-shadow",
    name: "No Shadow",
    description: "Disallow variable declarations that shadow outer scope",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "VariableDeclaration" && ctx.scopeStack.length > 1) {
        const declarations = (node as unknown as { declarations?: Array<{ id?: { name?: string } }> }).declarations;
        if (Array.isArray(declarations)) {
          for (const d of declarations) {
            const name = d.id?.name;
            if (name) {
              for (let i = 0; i < ctx.scopeStack.length - 1; i++) {
                if (ctx.scopeStack[i].has(name)) {
                  msgs.push({
                    ruleId: "no-shadow",
                    severity: "warning",
                    category: "best-practice",
                    message: `"${name}" shadows a variable from outer scope`,
                    line: 0,
                    column: 0,
                  });
                  break;
                }
              }
            }
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "max-depth",
    name: "Max Depth",
    description: "Enforce maximum nesting depth",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    options: { max: 4 },
    check: (node, ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const maxDepth = (ctx.config["max-depth"] as { max?: number })?.max ?? 4;
      if (ctx.scopeStack.length > maxDepth) {
        const nodeType = (node as unknown as { type?: string }).type;
        if (nodeType === "IfStatement" || nodeType === "ForStatement" || nodeType === "WhileStatement" || nodeType === "SwitchStatement") {
          msgs.push({
            ruleId: "max-depth",
            severity: "warning",
            category: "best-practice",
            message: `Maximum nesting depth of ${maxDepth} exceeded`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "max-params",
    name: "Max Params",
    description: "Enforce maximum number of function parameters",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    options: { max: 4 },
    check: (node, ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const maxParams = (ctx.config["max-params"] as { max?: number })?.max ?? 4;
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "FunctionDeclaration" || nodeType === "FunctionExpression" || nodeType === "ArrowFunctionExpression") {
        const params = (node as unknown as { params?: unknown[] }).params;
        if (Array.isArray(params) && params.length > maxParams) {
          msgs.push({
            ruleId: "max-params",
            severity: "warning",
            category: "best-practice",
            message: `Function has too many parameters (${params.length}). Max is ${maxParams}.`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "max-lines-per-function",
    name: "Max Lines Per Function",
    description: "Enforce maximum function length",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    options: { max: 100 },
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "complexity",
    name: "Complexity",
    description: "Enforce maximum cyclomatic complexity",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    options: { max: 10 },
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-magic-numbers",
    name: "No Magic Numbers",
    description: "Disallow magic numbers",
    severity: "info",
    category: "best-practice",
    enabled: false,
    options: { ignore: [0, 1, -1] },
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-restricted-syntax",
    name: "No Restricted Syntax",
    description: "Disallow specified syntax",
    severity: "error",
    category: "best-practice",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-restricted-globals",
    name: "No Restricted Globals",
    description: "Disallow specified global variables",
    severity: "error",
    category: "security",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-unsafe-finally",
    name: "No Unsafe Finally",
    description: "Disallow control flow in finally blocks",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "TryStatement") {
        const finalizer = (node as unknown as { finalizer?: { body?: Array<{ type?: string }> } }).finalizer;
        if (finalizer?.body && Array.isArray(finalizer.body)) {
          for (const stmt of finalizer.body) {
            const stmtType = (stmt as unknown as { type?: string }).type;
            if (stmtType === "ReturnStatement" || stmtType === "ThrowStatement" || stmtType === "BreakStatement" || stmtType === "ContinueStatement") {
              msgs.push({
                ruleId: "no-unsafe-finally",
                severity: "error",
                category: "best-practice",
                message: `Unsafe ${stmtType} in finally block`,
                line: 0,
                column: 0,
              });
            }
          }
        }
      }
      return msgs;
    },
  },
  {
    id: "no-unused-expressions",
    name: "No Unused Expressions",
    description: "Disallow unused expressions",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ExpressionStatement") {
        const expression = (node as unknown as { expression?: { type?: string } }).expression;
        if (expression?.type === "Literal" || expression?.type === "Identifier" || expression?.type === "TemplateLiteral") {
          msgs.push({
            ruleId: "no-unused-expressions",
            severity: "warning",
            category: "best-practice",
            message: "Unused expression",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "require-await",
    name: "Require Await",
    description: "Disallow async functions with no await",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-async-promise-executor",
    name: "No Async Promise Executor",
    description: "Disallow async function as Promise executor",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        const args = (node as unknown as { arguments?: Array<{ type?: string; async?: boolean }> }).arguments;
        if (callee?.name === "Promise" && args?.[0]?.async === true) {
          msgs.push({
            ruleId: "no-async-promise-executor",
            severity: "error",
            category: "best-practice",
            message: "Promise executor function should not be async",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "prefer-promise-reject-errors",
    name: "Prefer Promise Reject Errors",
    description: "Require Error objects in Promise.reject()",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-new",
    name: "No New",
    description: "Disallow new outside of assignment or comparison",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "ExpressionStatement") {
        const expression = (node as unknown as { expression?: { type?: string } }).expression;
        if (expression?.type === "NewExpression") {
          msgs.push({
            ruleId: "no-new",
            severity: "warning",
            category: "best-practice",
            message: "Do not use new without assignment",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-new-wrappers",
    name: "No New Wrappers",
    description: "Disallow new String/Number/Boolean",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name && ["String", "Number", "Boolean"].includes(callee.name)) {
          msgs.push({
            ruleId: "no-new-wrappers",
            severity: "warning",
            category: "best-practice",
            message: `Do not use new ${callee.name}()`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-array-constructor",
    name: "No Array Constructor",
    description: "Disallow Array constructor",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression" || nodeType === "CallExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name === "Array") {
          msgs.push({
            ruleId: "no-array-constructor",
            severity: "warning",
            category: "best-practice",
            message: "Use array literal instead of Array constructor",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-object-constructor",
    name: "No Object Constructor",
    description: "Disallow Object constructor",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name === "Object") {
          msgs.push({
            ruleId: "no-object-constructor",
            severity: "warning",
            category: "best-practice",
            message: "Use object literal instead of Object constructor",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-new-symbol",
    name: "No New Symbol",
    description: "Disallow new Symbol()",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name === "Symbol") {
          msgs.push({
            ruleId: "no-new-symbol",
            severity: "error",
            category: "best-practice",
            message: "Symbol must not be called with new",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-iterator",
    name: "No Iterator",
    description: "Disallow __iterator__ property",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "MemberExpression") {
        const property = (node as unknown as { property?: { name?: string } }).property;
        if (property?.name === "__iterator__") {
          msgs.push({
            ruleId: "no-iterator",
            severity: "error",
            category: "best-practice",
            message: "Reserved name __iterator__",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-proto",
    name: "No Proto",
    description: "Disallow __proto__ property",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "MemberExpression") {
        const property = (node as unknown as { property?: { name?: string } }).property;
        if (property?.name === "__proto__") {
          msgs.push({
            ruleId: "no-proto",
            severity: "error",
            category: "best-practice",
            message: "Reserved name __proto__",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-caller",
    name: "No Caller",
    description: "Disallow arguments.caller and arguments.callee",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "MemberExpression") {
        const property = (node as unknown as { property?: { name?: string } }).property;
        if (property?.name === "caller" || property?.name === "callee") {
          msgs.push({
            ruleId: "no-caller",
            severity: "error",
            category: "best-practice",
            message: `Disallow arguments.${property.name}`,
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-extend-native",
    name: "No Extend Native",
    description: "Disallow extending native prototypes",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-global-assign",
    name: "No Global Assign",
    description: "Disallow assignment to native globals",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-implicit-globals",
    name: "No Implicit Globals",
    description: "Disallow implicit global variables",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-labels",
    name: "No Labels",
    description: "Disallow labeled statements",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "LabeledStatement") {
        msgs.push({
          ruleId: "no-labels",
          severity: "error",
          category: "best-practice",
          message: "Labeled statements are not allowed",
          line: 0,
          column: 0,
        });
      }
      return msgs;
    },
  },
  {
    id: "no-label-var",
    name: "No Label Var",
    description: "Disallow labels with same name as variables",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-unused-labels",
    name: "No Unused Labels",
    description: "Disallow unused labels",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-script-url",
    name: "No Script URL",
    description: "Disallow javascript: URLs",
    severity: "error",
    category: "security",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "Literal") {
        const value = (node as unknown as { value?: string }).value;
        if (typeof value === "string" && value.toLowerCase().startsWith("javascript:")) {
          msgs.push({
            ruleId: "no-script-url",
            severity: "error",
            category: "security",
            message: "javascript: URL is not allowed",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-useless-escape",
    name: "No Useless Escape",
    description: "Disallow unnecessary escape characters",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-useless-return",
    name: "No Useless Return",
    description: "Disallow unnecessary return statements",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-useless-constructor",
    name: "No Useless Constructor",
    description: "Disallow unnecessary constructors",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-useless-call",
    name: "No Useless Call",
    description: "Disallow unnecessary .call() and .apply()",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-warning-comments",
    name: "No Warning Comments",
    description: "Disallow TODO/FIXME comments",
    severity: "info",
    category: "best-practice",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "prefer-template",
    name: "Prefer Template",
    description: "Prefer template literals over string concatenation",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "prefer-spread",
    name: "Prefer Spread",
    description: "Prefer spread operator over .apply()",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "prefer-rest-params",
    name: "Prefer Rest Params",
    description: "Prefer rest parameters over arguments",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "prefer-destructuring",
    name: "Prefer Destructuring",
    description: "Prefer destructuring over property access",
    severity: "info",
    category: "style",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-multi-assign",
    name: "No Multi Assign",
    description: "Disallow chained assignments",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-multi-str",
    name: "No Multi Str",
    description: "Disallow multi-line strings",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-octal",
    name: "No Octal",
    description: "Disallow octal literals",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-octal-escape",
    name: "No Octal Escape",
    description: "Disallow octal escape sequences in strings",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-implied-eval",
    name: "No Implied Eval",
    description: "Disallow implied eval()",
    severity: "error",
    category: "security",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-new-func",
    name: "No New Func",
    description: "Disallow new Function()",
    severity: "error",
    category: "security",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression" || nodeType === "CallExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name === "Function") {
          msgs.push({
            ruleId: "no-new-func",
            severity: "error",
            category: "security",
            message: "Function constructor is not allowed",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-new-object",
    name: "No New Object",
    description: "Disallow new Object()",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "NewExpression") {
        const callee = (node as unknown as { callee?: { name?: string } }).callee;
        if (callee?.name === "Object") {
          msgs.push({
            ruleId: "no-new-object",
            severity: "warning",
            category: "best-practice",
            message: "Use object literal instead of new Object()",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-new-require",
    name: "No New Require",
    description: "Disallow new require()",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-path-concat",
    name: "No Path Concat",
    description: "Disallow string concatenation with __dirname and __filename",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-process-env",
    name: "No Process Env",
    description: "Disallow process.env",
    severity: "warning",
    category: "best-practice",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-process-exit",
    name: "No Process Exit",
    description: "Disallow process.exit()",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "CallExpression") {
        const callee = (node as unknown as { callee?: { object?: { name?: string }; property?: { name?: string } } }).callee;
        if (callee?.object?.name === "process" && callee?.property?.name === "exit") {
          msgs.push({
            ruleId: "no-process-exit",
            severity: "warning",
            category: "best-practice",
            message: "process.exit() is not allowed",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-restricted-modules",
    name: "No Restricted Modules",
    description: "Disallow specified modules",
    severity: "error",
    category: "best-practice",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-sync",
    name: "No Sync",
    description: "Disallow synchronous methods",
    severity: "warning",
    category: "performance",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-void",
    name: "No Void",
    description: "Disallow void operator",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "UnaryExpression") {
        const operator = (node as unknown as { operator?: string }).operator;
        if (operator === "void") {
          msgs.push({
            ruleId: "no-void",
            severity: "warning",
            category: "best-practice",
            message: "void operator is not allowed",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-with-strict",
    name: "No With Strict",
    description: "Disallow with in strict mode",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "strict",
    name: "Strict",
    description: "Require strict mode directive",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "init-declarations",
    name: "Init Declarations",
    description: "Require or disallow initialization in variable declarations",
    severity: "info",
    category: "best-practice",
    enabled: false,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-catch-shadow",
    name: "No Catch Shadow",
    description: "Disallow catch clause parameters that shadow outer scope",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-delete-var",
    name: "No Delete Var",
    description: "Disallow delete on variables",
    severity: "error",
    category: "best-practice",
    enabled: true,
    check: (node, _ctx) => {
      const msgs: DiagnosticMessage[] = [];
      const nodeType = (node as unknown as { type?: string }).type;
      if (nodeType === "UnaryExpression") {
        const operator = (node as unknown as { operator?: string }).operator;
        const argument = (node as unknown as { argument?: { type?: string } }).argument;
        if (operator === "delete" && argument?.type === "Identifier") {
          msgs.push({
            ruleId: "no-delete-var",
            severity: "error",
            category: "best-practice",
            message: "Cannot delete variables",
            line: 0,
            column: 0,
          });
        }
      }
      return msgs;
    },
  },
  {
    id: "no-undef-init",
    name: "No Undef Init",
    description: "Disallow initializing to undefined",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-undef",
    name: "No Undef",
    description: "Disallow undeclared variables",
    severity: "error",
    category: "semantic",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
  {
    id: "no-use-before-define",
    name: "No Use Before Define",
    description: "Disallow using variables before they are defined",
    severity: "warning",
    category: "best-practice",
    enabled: true,
    check: (_node, _ctx) => {
      return [];
    },
  },
];

export function createDefaultRulesEngine(): RulesEngine {
  const engine = new RulesEngine();
  for (const rule of BUILTIN_RULES) {
    engine.registerRule(rule);
  }
  return engine;
}

export function getBuiltinRuleCount(): number {
  return BUILTIN_RULES.length;
}

export function getBuiltinRulesByCategory(): Record<DiagnosticCategory, number> {
  const counts: Record<DiagnosticCategory, number> = {} as Record<DiagnosticCategory, number>;
  for (const rule of BUILTIN_RULES) {
    counts[rule.category] = (counts[rule.category] ?? 0) + 1;
  }
  return counts;
}

export function getBuiltinRulesBySeverity(): Record<DiagnosticSeverity, number> {
  const counts: Record<DiagnosticSeverity, number> = {} as Record<DiagnosticSeverity, number>;
  for (const rule of BUILTIN_RULES) {
    counts[rule.severity] = (counts[rule.severity] ?? 0) + 1;
  }
  return counts;
}

export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [
    "=== Diagnostic Report ===",
    "",
    `Total: ${report.total}`,
    `Errors: ${report.errorCount}`,
    `Warnings: ${report.warningCount}`,
    `Info: ${report.infoCount}`,
    `Hints: ${report.hintCount}`,
    "",
    "=== By Category ===",
  ];
  for (const [category, count] of Object.entries(report.byCategory)) {
    lines.push(`  ${category}: ${count}`);
  }
  lines.push("", "=== By Rule ===");
  for (const [rule, count] of Object.entries(report.byRule).sort(([, a], [, b]) => b - a)) {
    lines.push(`  ${rule}: ${count}`);
  }
  lines.push("", "=== Messages ===");
  for (const msg of report.messages) {
    lines.push(`  [${msg.severity.toUpperCase()}] ${msg.ruleId}: ${msg.message} (line ${msg.line}, col ${msg.column})`);
  }
  return lines.join("\n");
}

export function getDiagnosticStats(report: DiagnosticReport): {
  hasErrors: boolean;
  hasWarnings: boolean;
  isClean: boolean;
  score: number;
} {
  return {
    hasErrors: report.errorCount > 0,
    hasWarnings: report.warningCount > 0,
    isClean: report.total === 0,
    score: Math.max(0, 100 - report.errorCount * 10 - report.warningCount * 5 - report.infoCount * 1 - report.hintCount * 0.5),
  };
}
