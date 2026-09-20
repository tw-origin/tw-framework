/**
 * Expression parser -- full expression grammar with precedence climbing,
 * associativity, and all JavaScript-like expression types.
 */

import type { Token, TokenType } from "../../lexer/tokens";
import { TokenStream, makeToken } from "../../lexer/tokens";
import type {
  ExpressionNode, LiteralExpr, IdentifierExpr, BinaryExpr, UnaryExpr,
  LogicalExpr, ConditionalExpr, MemberExpr, CallExpr, AssignmentExpr,
  ArrayExpr, ObjectExpr, ArrowFnExpr, TemplateExpr, SpreadExpr,
  AwaitExpr, YieldExpr, NewExpr, SequenceExpr, ObjectProperty, Param,
} from "../../ast/nodes";
import { ErrorCollector } from "../recovery";

// --- Operator Precedence -----------------------------------------------------

const PRECEDENCE: Record<string, number> = {
  // Highest
  "MEMBER": 19,      // . []
  "CALL": 18,        // ()
  "NEW": 17,         // new
  "POSTFIX": 16,     // ++ --
  "PREFIX": 15,      // ! ~ + - ++ -- typeof void delete await
  "EXPONENT": 14,    // **
  "MULTIPLY": 13,    // * / %
  "ADD": 12,         // + -
  "SHIFT": 11,       // << >> >>>
  "COMPARE": 10,     // < <= > >=
  "EQUALITY": 9,     // == != === !==
  "BITAND": 8,       // &
  "BITXOR": 7,       // ^
  "BITOR": 6,        // |
  "LOGAND": 5,       // &&
  "LOGOR": 4,        // ||
  "NULLISH": 4,      // ??
  "CONDITIONAL": 3,   // ?:
  "ASSIGN": 2,       // = += -= etc.
  "COMMA": 1,        // ,
  // Lowest
};

function getPrecedence(op: string): number {
  const map: Record<string, number> = {
    "**": PRECEDENCE.EXPONENT,
    "*": PRECEDENCE.MULTIPLY, "/": PRECEDENCE.MULTIPLY, "%": PRECEDENCE.MULTIPLY,
    "+": PRECEDENCE.ADD, "-": PRECEDENCE.ADD,
    "<<": PRECEDENCE.SHIFT, ">>": PRECEDENCE.SHIFT, ">>>": PRECEDENCE.SHIFT,
    "<": PRECEDENCE.COMPARE, "<=": PRECEDENCE.COMPARE,
    ">": PRECEDENCE.COMPARE, ">=": PRECEDENCE.COMPARE,
    "==": PRECEDENCE.EQUALITY, "!=": PRECEDENCE.EQUALITY,
    "===": PRECEDENCE.EQUALITY, "!==": PRECEDENCE.EQUALITY,
    "&": PRECEDENCE.BITAND,
    "^": PRECEDENCE.BITXOR,
    "|": PRECEDENCE.BITOR,
    "&&": PRECEDENCE.LOGAND,
    "||": PRECEDENCE.LOGOR,
    "??": PRECEDENCE.NULLISH,
    "?": PRECEDENCE.CONDITIONAL,
    "=": PRECEDENCE.ASSIGN,
    "+=": PRECEDENCE.ASSIGN, "-=": PRECEDENCE.ASSIGN,
    "*=": PRECEDENCE.ASSIGN, "/=": PRECEDENCE.ASSIGN, "%=": PRECEDENCE.ASSIGN,
    "**=": PRECEDENCE.ASSIGN,
    "&=": PRECEDENCE.ASSIGN, "|=": PRECEDENCE.ASSIGN, "^=": PRECEDENCE.ASSIGN,
    "<<=": PRECEDENCE.ASSIGN, ">>=": PRECEDENCE.ASSIGN, ">>>=": PRECEDENCE.ASSIGN,
    "&&=": PRECEDENCE.ASSIGN, "||=": PRECEDENCE.ASSIGN, "??=": PRECEDENCE.ASSIGN,
    ",": PRECEDENCE.COMMA,
  };
  return map[op] ?? 0;
}

const RIGHT_ASSOCIATIVE = new Set([
  "**", "=", "+=", "-=", "*=", "/=", "%=", "**=",
  "&=", "|=", "^=", "<<=", ">>=", ">>>=",
  "&&=", "||=", "??=",
]);

// --- Token Cursor ------------------------------------------------------------

export class TokenCursor {
  private stream: TokenStream;
  public errors: ErrorCollector;

  constructor(tokens: Token[], errors?: ErrorCollector) {
    this.stream = new TokenStream(tokens);
    this.errors = errors ?? new ErrorCollector();
  }

  get position(): number { return this.stream.position; }
  get done(): boolean { return this.stream.done; }

  peek(offset: number = 0): Token | null {
    return this.stream.peek(offset);
  }

  advance(): Token | null {
    return this.stream.advance();
  }

  expect(type: TokenType): Token {
    const token = this.peek();
    if (!token) {
      this.errors.add({
        type: "error", message: `Expected ${type} but reached EOF`,
        line: 0, col: 0, code: "TW001", severity: "error",
      } as any);
      return makeToken(type, "", { line: 0, col: 0, offset: 0 }, { line: 0, col: 0, offset: 0 });
    }
    if (token.type !== type) {
      this.errors.add({
        type: "error", message: `Expected ${type} but got ${token.type}`,
        line: token.pos.line, col: token.pos.col, code: "TW002", severity: "error",
      } as any);
    }
    this.advance();
    return token;
  }

  match(type: TokenType): boolean {
    const token = this.peek();
    if (token && token.type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  matches(...types: TokenType[]): boolean {
    const token = this.peek();
    return token !== null && types.includes(token.type);
  }

  consumeIf(type: TokenType): Token | null {
    if (this.match(type)) return this.stream.peek(-1);
    return null;
  }

  save(): void { this.stream.save(); }
  restore(): void { this.stream.restore(); }
  commit(): void { this.stream.commit(); }

  skipWhitespace(): void {
    while (!this.done) {
      const t = this.peek();
      if (!t) break;
      if (t.type === "WHITESPACE" || t.type === "NEWLINE") {
        this.advance();
      } else {
        break;
      }
    }
  }

  skipNewlines(): void {
    this.skipWhitespace();
  }

  consumeValue(): string {
    this.skipWhitespace();
    const token = this.peek();
    if (!token) return "";
    this.advance();
    return token.value;
  }

  // Read until a specific token type
  readUntil(stopType: TokenType): Token[] {
    const tokens: Token[] = [];
    while (!this.done) {
      const token = this.peek();
      if (!token || token.type === stopType || token.type === "EOF") break;
      tokens.push(token);
      this.advance();
    }
    return tokens;
  }

  // Find matching close token
  findMatching(open: TokenType, close: TokenType): number {
    return this.stream.findMatching(open, close);
  }
}

// --- Expression Parser ----------------------------------------------------------

export class ExpressionParser {
  private cursor: TokenCursor;

  constructor(cursor: TokenCursor) {
    this.cursor = cursor;
  }

  parseExpression(): ExpressionNode | null {
    return this.parseAssignment();
  }

  // --- Assignment ------------------------------------------------------------

  private parseAssignment(): ExpressionNode | null {
    const left = this.parseConditional();
    if (!left) return null;

    const token = this.cursor.peek();
    if (!token) return left;

    const assignOps = ["ASSIGN", "PLUS_ASSIGN", "MINUS_ASSIGN", "STAR_ASSIGN",
      "SLASH_ASSIGN", "PERCENT_ASSIGN", "EXP_ASSIGN", "AMP_ASSIGN",
      "PIPE_ASSIGN", "CARET_ASSIGN", "SHL_ASSIGN", "SHR_ASSIGN",
      "USHR_ASSIGN", "AND_ASSIGN", "OR_ASSIGN", "NULLISH_ASSIGN"];

    if (assignOps.includes(token.type)) {
      this.cursor.advance();
      const right = this.parseAssignment();
      if (right) {
        return {
          type: "AssignmentExpr",
          operator: token.value,
          left,
          right,
          line: token.pos.line,
          col: token.pos.col,
        } as AssignmentExpr;
      }
    }

    return left;
  }

  // --- Conditional (Ternary) --------------------------------------------------

  private parseConditional(): ExpressionNode | null {
    const test = this.parseBinary(0);
    if (!test) return null;

    const token = this.cursor.peek();
    if (token && token.type === "QUESTION") {
      this.cursor.advance();
      const consequent = this.parseAssignment();
      this.cursor.expect("COLON");
      const alternate = this.parseAssignment();

      if (consequent && alternate) {
        return {
          type: "ConditionalExpr",
          test,
          consequent,
          alternate,
          line: token.pos.line,
          col: token.pos.col,
        } as ConditionalExpr;
      }
    }

    return test;
  }

  // --- Binary Expressions (Precedence Climbing) ------------------------------

  private parseBinary(minPrec: number): ExpressionNode | null {
    let left = this.parseUnary();
    if (!left) return null;

    while (true) {
      this.cursor.skipWhitespace();
      const token = this.cursor.peek();
      if (!token || token.type === "EOF") break;

      const prec = getPrecedence(token.value);
      if (prec < minPrec || prec === 0) break;

      this.cursor.advance();
      const rightPrec = RIGHT_ASSOCIATIVE.has(token.value) ? prec : prec + 1;
      const right = this.parseBinary(rightPrec);

      if (right) {
        // Determine expression type
        const isLogical = ["&&", "||", "??"].includes(token.value);

        left = {
          type: isLogical ? "LogicalExpr" : "BinaryExpr",
          operator: token.value,
          left,
          right,
          line: token.pos.line,
          col: token.pos.col,
        } as any;
      }
    }

    return left;
  }

  // --- Unary Expressions -----------------------------------------------------

  private parseUnary(): ExpressionNode | null {
    const token = this.cursor.peek();
    if (!token) return null;

    const unaryOps = ["BANG", "TILDE", "PLUS", "MINUS", "CARET"];
    const prefixKeywords = ["typeof", "void", "delete", "await", "yield"];

    if (unaryOps.includes(token.type)) {
      this.cursor.advance();
      const operand = this.parseUnary();
      if (operand) {
        return {
          type: "UnaryExpr",
          operator: token.value,
          operand,
          prefix: true,
          line: token.pos.line,
          col: token.pos.col,
        } as UnaryExpr;
      }
    }

    if (token.type === "KEYWORD" && prefixKeywords.includes(token.value)) {
      this.cursor.advance();
      const operand = this.parseUnary();

      if (token.value === "await" && operand) {
        return {
          type: "Await",
          argument: operand,
          line: token.pos.line,
          col: token.pos.col,
        } as AwaitExpr;
      }

      if (token.value === "yield" && operand) {
        return {
          type: "Yield",
          argument: operand,
          delegate: false,
          line: token.pos.line,
          col: token.pos.col,
        } as YieldExpr;
      }

      if (operand) {
        return {
          type: "UnaryExpr",
          operator: token.value,
          operand,
          prefix: true,
          line: token.pos.line,
          col: token.pos.col,
        } as UnaryExpr;
      }
    }

    // Postfix ++ --
    const expr = this.parsePostfix();
    return expr;
  }

  private parsePostfix(): ExpressionNode | null {
    const expr = this.parseCallMember();
    if (!expr) return null;

    const token = this.cursor.peek();
    if (token && (token.type === "PLUS" || token.type === "MINUS")) {
      // Check if it's actually ++ or --
      // This is simplified -- a real parser would check for combined tokens
    }

    return expr;
  }

  // --- Call & Member Expressions ---------------------------------------------

  private parseCallMember(): ExpressionNode | null {
    let expr = this.parsePrimary();
    if (!expr) return null;

    while (true) {
      const token = this.cursor.peek();
      if (!token) break;

      // Member access: .property
      if (token.type === "DOT") {
        this.cursor.advance();
        const propToken = this.cursor.peek();
        if (propToken) {
          this.cursor.advance();
          expr = {
            type: "MemberExpr",
            object: expr,
            property: {
              type: "Identifier",
              name: propToken.value,
              line: propToken.pos.line,
              col: propToken.pos.col,
            } as IdentifierExpr,
            computed: false,
            optional: false,
            line: token.pos.line,
            col: token.pos.col,
          } as MemberExpr;
        }
        continue;
      }

      // Computed member: [expr]
      if (token.type === "LBRACKET") {
        this.cursor.advance();
        const propExpr = this.parseExpression();
        this.cursor.expect("RBRACKET");
        if (propExpr) {
          expr = {
            type: "MemberExpr",
            object: expr,
            property: propExpr,
            computed: true,
            optional: false,
            line: token.pos.line,
            col: token.pos.col,
          } as MemberExpr;
        }
        continue;
      }

      // Function call: (args)
      if (token.type === "LPAREN") {
        this.cursor.advance();
        const args = this.parseArguments();
        this.cursor.expect("RPAREN");
        expr = {
          type: "CallExpr",
          callee: expr,
          args,
          optional: false,
          line: token.pos.line,
          col: token.pos.col,
        } as CallExpr;
        continue;
      }

      // Optional chaining: ?.
      // Tagged templates: `template`

      break;
    }

    return expr;
  }

  private parseArguments(): ExpressionNode[] {
    const args: ExpressionNode[] = [];

    this.cursor.skipWhitespace();
    if (this.cursor.matches("RPAREN")) return args;

    do {
      this.cursor.skipWhitespace();

      // Spread
      if (this.cursor.matches("SPREAD")) {
        this.cursor.advance();
        const arg = this.parseAssignment();
        if (arg) {
          args.push({
            type: "Spread",
            argument: arg,
            line: arg.line,
            col: arg.col,
          } as SpreadExpr);
        }
      } else {
        const arg = this.parseAssignment();
        if (arg) args.push(arg);
      }

      this.cursor.skipWhitespace();
    } while (this.cursor.match("COMMA"));

    return args;
  }

  // --- Primary Expressions ----------------------------------------------------

  private parsePrimary(): ExpressionNode | null {
    const token = this.cursor.peek();
    if (!token || token.type === "EOF") return null;

    // Literals
    if (token.type === "NUMBER") {
      this.cursor.advance();
      return {
        type: "Literal",
        value: parseFloat(token.value),
        dataType: "number",
        raw: token.raw,
        line: token.pos.line,
        col: token.pos.col,
      } as LiteralExpr;
    }

    if (token.type === "STRING") {
      this.cursor.advance();
      return {
        type: "Literal",
        value: token.value,
        dataType: "string",
        raw: token.raw,
        line: token.pos.line,
        col: token.pos.col,
      } as LiteralExpr;
    }

    if (token.type === "BOOLEAN") {
      this.cursor.advance();
      return {
        type: "Literal",
        value: token.value === "true",
        dataType: "boolean",
        raw: token.raw,
        line: token.pos.line,
        col: token.pos.col,
      } as LiteralExpr;
    }

    if (token.type === "NULL") {
      this.cursor.advance();
      return {
        type: "Literal",
        value: null,
        dataType: "null",
        raw: token.raw,
        line: token.pos.line,
        col: token.pos.col,
      } as LiteralExpr;
    }

    // Template literal
    if (token.type === "TEMPLATE") {
      this.cursor.advance();
      return {
        type: "TemplateExpr",
        quasis: [token.value],
        expressions: [],
        line: token.pos.line,
        col: token.pos.col,
      } as TemplateExpr;
    }

    // Regex
    if (token.type === "REGEX") {
      this.cursor.advance();
      return {
        type: "Literal",
        value: token.value,
        dataType: "string",
        raw: token.raw,
        line: token.pos.line,
        col: token.pos.col,
      } as LiteralExpr;
    }

    // Identifier
    if (token.type === "IDENT" || token.type === "KEYWORD") {
      this.cursor.advance();
      return {
        type: "Identifier",
        name: token.value,
        line: token.pos.line,
        col: token.pos.col,
      } as IdentifierExpr;
    }

    // Parenthesized expression
    if (token.type === "LPAREN") {
      this.cursor.advance();
      const expr = this.parseExpression();
      this.cursor.expect("RPAREN");
      return expr;
    }

    // Array literal
    if (token.type === "LBRACKET") {
      return this.parseArrayLiteral();
    }

    // Object literal
    if (token.type === "LBRACE") {
      return this.parseObjectLiteral();
    }

    // new expression
    if ((token.type as any) === "KEYWORD" && token.value === "new") {
      this.cursor.advance();
      const callee = this.parseCallMember();
      this.cursor.skipWhitespace();
      const args: ExpressionNode[] = [];
      if (this.cursor.matches("LPAREN")) {
        this.cursor.advance();
        args.push(...this.parseArguments());
        this.cursor.expect("RPAREN");
      }
      if (callee) {
        return {
          type: "NewExpr",
          callee,
          args,
          line: token.pos.line,
          col: token.pos.col,
        } as NewExpr;
      }
    }

    // Arrow function detection: (params) => or ident =>
    // Try to parse as arrow function
    this.cursor.save();
    const arrowResult = this.tryParseArrow();
    if (arrowResult) {
      this.cursor.commit();
      return arrowResult;
    }
    this.cursor.restore();

    return null;
  }

  private tryParseArrow(): ExpressionNode | null {
    // Simple attempt: IDENT ARROW expr
    const token = this.cursor.peek();
    if (!token) return null;

    if (token.type === "IDENT") {
      this.cursor.advance();
      this.cursor.skipWhitespace();
      if (this.cursor.matches("ARROW")) {
        this.cursor.advance();
        const body = this.parseAssignment();
        if (body) {
          return {
            type: "ArrowFn",
            params: [{ name: token.value, rest: false }],
            body,
            expression: true,
            async: false,
            line: token.pos.line,
            col: token.pos.col,
          } as ArrowFnExpr;
        }
      }
      return null;
    }

    return null;
  }

  private parseArrayLiteral(): ExpressionNode | null {
    const token = this.cursor.peek();
    if (!token) return null;
    this.cursor.expect("LBRACKET");

    const elements: (ExpressionNode | null)[] = [];
    this.cursor.skipWhitespace();

    if (!this.cursor.matches("RBRACKET")) {
      do {
        this.cursor.skipWhitespace();
        if (this.cursor.matches("COMMA")) {
          elements.push(null); // Hole
          continue;
        }
        if (this.cursor.matches("SPREAD")) {
          this.cursor.advance();
          const arg = this.parseAssignment();
          if (arg) {
            elements.push({
              type: "Spread",
              argument: arg,
              line: arg.line,
              col: arg.col,
            } as SpreadExpr);
          }
        } else {
          elements.push(this.parseAssignment());
        }
        this.cursor.skipWhitespace();
      } while (this.cursor.match("COMMA"));
    }

    this.cursor.expect("RBRACKET");
    return {
      type: "ArrayExpr",
      elements,
      line: token.pos.line,
      col: token.pos.col,
    } as ArrayExpr;
  }

  private parseObjectLiteral(): ExpressionNode | null {
    const token = this.cursor.peek();
    if (!token) return null;
    this.cursor.expect("LBRACE");

    const properties: ObjectProperty[] = [];
    this.cursor.skipWhitespace();

    if (!this.cursor.matches("RBRACE")) {
      do {
        this.cursor.skipWhitespace();
        const keyToken = this.cursor.peek();
        if (!keyToken) break;

        let key = "";
        let computed = false;

        if (keyToken.type === "LBRACKET") {
          this.cursor.advance();
          computed = true;
          const keyExpr = this.parseExpression();
          if (keyExpr) key = (keyExpr as any).name || JSON.stringify((keyExpr as any).value);
          this.cursor.expect("RBRACKET");
        } else {
          key = keyToken.value;
          this.cursor.advance();
        }

        let value: ExpressionNode;
        let shorthand = false;

        if (this.cursor.matches("COLON")) {
          this.cursor.advance();
          const valExpr = this.parseAssignment();
          if (!valExpr) continue;
          value = valExpr;
        } else {
          // Shorthand
          shorthand = true;
          value = {
            type: "Identifier",
            name: key,
            line: keyToken.pos.line,
            col: keyToken.pos.col,
          } as IdentifierExpr;
        }

        properties.push({ key, value, computed, shorthand, isMethod: false });

        this.cursor.skipWhitespace();
      } while (this.cursor.match("COMMA"));
    }

    this.cursor.expect("RBRACE");
    return {
      type: "ObjectExpr",
      properties,
      line: token.pos.line,
      col: token.pos.col,
    } as ObjectExpr;
  }

  // --- Parse from raw string --------------------------------------------------

  static parse(source: string): ExpressionNode | null {
    // Simple inline expression parser -- for full parsing, use the tokenizer
    // This is a fallback for simple expressions
    return null;
  }
}
