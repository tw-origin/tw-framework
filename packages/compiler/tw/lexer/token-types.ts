/**
 * Token types and definitions for the TW language lexer.
 * @module compiler/lexer
 */

export enum TokenType {
  EOF = "EOF",
  UNKNOWN = "UNKNOWN",
  WHITESPACE = "WHITESPACE",
  COMMENT = "COMMENT",
  LINE_COMMENT = "LINE_COMMENT",
  BLOCK_COMMENT = "BLOCK_COMMENT",
  NEWLINE = "NEWLINE",
  IDENTIFIER = "IDENTIFIER",
  KEYWORD = "KEYWORD",
  NUMBER_LITERAL = "NUMBER_LITERAL",
  STRING_LITERAL = "STRING_LITERAL",
  CHAR_LITERAL = "CHAR_LITERAL",
  REGEX_LITERAL = "REGEX_LITERAL",
  TEMPLATE_LITERAL = "TEMPLATE_LITERAL",
  BOOLEAN_LITERAL = "BOOLEAN_LITERAL",
  NULL_LITERAL = "NULL_LITERAL",
  UNDEFINED_LITERAL = "UNDEFINED_LITERAL",
  BIGINT_LITERAL = "BIGINT_LITERAL",
  PUNCTUATOR = "PUNCTUATOR",
  OPERATOR = "OPERATOR",
  ARROW = "ARROW",
  SPREAD = "SPREAD",
  OPTIONAL = "OPTIONAL",
  NULLISH = "NULLISH",
  EXPONENT = "EXPONENT",
  LEFT_SHIFT = "LEFT_SHIFT",
  RIGHT_SHIFT = "RIGHT_SHIFT",
  UNSIGNED_RIGHT_SHIFT = "UNSIGNED_RIGHT_SHIFT",
  LESS_EQUAL = "LESS_EQUAL",
  GREATER_EQUAL = "GREATER_EQUAL",
  EQUAL = "EQUAL",
  NOT_EQUAL = "NOT_EQUAL",
  STRICT_EQUAL = "STRICT_EQUAL",
  STRICT_NOT_EQUAL = "STRICT_NOT_EQUAL",
  LOGICAL_AND = "LOGICAL_AND",
  LOGICAL_OR = "LOGICAL_OR",
  LOGICAL_NULLISH = "LOGICAL_NULLISH",
  BITWISE_AND = "BITWISE_AND",
  BITWISE_OR = "BITWISE_OR",
  BITWISE_XOR = "BITWISE_XOR",
  BITWISE_NOT = "BITWISE_NOT",
  PLUS = "PLUS",
  MINUS = "MINUS",
  MULTIPLY = "MULTIPLY",
  DIVIDE = "DIVIDE",
  MODULO = "MODULO",
  INCREMENT = "INCREMENT",
  DECREMENT = "DECREMENT",
  ASSIGN = "ASSIGN",
  PLUS_ASSIGN = "PLUS_ASSIGN",
  MINUS_ASSIGN = "MINUS_ASSIGN",
  MULTIPLY_ASSIGN = "MULTIPLY_ASSIGN",
  DIVIDE_ASSIGN = "DIVIDE_ASSIGN",
  MODULO_ASSIGN = "MODULO_ASSIGN",
  BITWISE_AND_ASSIGN = "BITWISE_AND_ASSIGN",
  BITWISE_OR_ASSIGN = "BITWISE_OR_ASSIGN",
  BITWISE_XOR_ASSIGN = "BITWISE_XOR_ASSIGN",
  LEFT_SHIFT_ASSIGN = "LEFT_SHIFT_ASSIGN",
  RIGHT_SHIFT_ASSIGN = "RIGHT_SHIFT_ASSIGN",
  UNSIGNED_RIGHT_SHIFT_ASSIGN = "UNSIGNED_RIGHT_SHIFT_ASSIGN",
  LOGICAL_AND_ASSIGN = "LOGICAL_AND_ASSIGN",
  LOGICAL_OR_ASSIGN = "LOGICAL_OR_ASSIGN",
  LOGICAL_NULLISH_ASSIGN = "LOGICAL_NULLISH_ASSIGN",
  LEFT_PAREN = "LEFT_PAREN",
  RIGHT_PAREN = "RIGHT_PAREN",
  LEFT_BRACKET = "LEFT_BRACKET",
  RIGHT_BRACKET = "RIGHT_BRACKET",
  LEFT_BRACE = "LEFT_BRACE",
  RIGHT_BRACE = "RIGHT_BRACE",
  COMMA = "COMMA",
  SEMICOLON = "SEMICOLON",
  COLON = "COLON",
  DOT = "DOT",
  QUESTION_MARK = "QUESTION_MARK",
  OPTIONAL_CHAIN = "OPTIONAL_CHAIN",
  BACKTICK = "BACKTICK",
  AT = "AT",
  HASH = "HASH",
  DOLLAR = "DOLLAR",
  BACKSLASH = "BACKSLASH",
}

export enum KeywordType {
  BREAK = "break",
  CASE = "case",
  CATCH = "catch",
  CLASS = "class",
  CONST = "const",
  CONTINUE = "continue",
  DEBUGGER = "debugger",
  DEFAULT = "default",
  DELETE = "delete",
  DO = "do",
  ELSE = "else",
  EXPORT = "export",
  EXTENDS = "extends",
  FINALLY = "finally",
  FOR = "for",
  FUNCTION = "function",
  IF = "if",
  IMPORT = "import",
  IN = "in",
  INSTANCEOF = "instanceof",
  LET = "let",
  NEW = "new",
  OF = "of",
  RETURN = "return",
  SUPER = "super",
  SWITCH = "switch",
  THIS = "this",
  THROW = "throw",
  TRY = "try",
  TYPEOF = "typeof",
  VAR = "var",
  VOID = "void",
  WHILE = "while",
  WITH = "with",
  YIELD = "yield",
  ASYNC = "async",
  AWAIT = "await",
  OF2 = "of",
  GET = "get",
  SET = "set",
  STATIC = "static",
  ABSTRACT = "abstract",
  AS = "as",
  ASSERTS = "asserts",
  ASSERT = "assert",
  ANY = "any",
  BOOLEAN = "boolean",
  BIGINT = "bigint",
  NEVER = "never",
  NUMBER = "number",
  OBJECT = "object",
  STRING = "string",
  SYMBOL = "symbol",
  UNDEFINED = "undefined",
  UNKNOWN = "unknown",
  VOID2 = "void",
  IN2 = "in",
  KEYOF = "keyof",
  INFER = "infer",
  READONLY = "readonly",
  UNIQUE = "unique",
  DECLARE = "declare",
  TYPE = "type",
  INTERFACE = "interface",
  ENUM = "enum",
  NAMESPACE = "namespace",
  MODULE = "module",
  GLOBAL = "global",
  IS = "is",
  SATISFIES = "satisfies",
  OVERRIDE = "override",
  PUBLIC = "public",
  PRIVATE = "private",
  PROTECTED = "protected",
  READONLY2 = "readonly",
  IMPLEMENTS = "implements",
  PACKAGE = "package",
  FROM = "from",
  META = "meta",
  TARGET = "target",
  CONSTRUCTOR = "constructor",
  PROTOTYPE = "prototype",
  INSTANCE = "instance",
}

export const KEYWORDS = new Set<string>(Object.values(KeywordType));

export const RESERVED_WORDS = new Set<string>([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "export", "extends", "finally",
  "for", "function", "if", "import", "in", "instanceof", "let", "new",
  "of", "return", "super", "switch", "this", "throw", "try", "typeof",
  "var", "void", "while", "with", "yield", "async", "await",
]);

export const STRICT_MODE_RESERVED = new Set<string>([
  "implements", "interface", "let", "package", "private", "protected",
  "public", "static", "yield",
]);

export const CONTEXTUAL_KEYWORDS = new Set<string>([
  "abstract", "as", "asserts", "async", "await", "boolean", "constructor",
  "declare", "enum", "from", "get", "global", "implements", "infer",
  "interface", "intrinsic", "is", "keyof", "let", "module", "namespace",
  "never", "number", "object", "of", "override", "private", "protected",
  "public", "readonly", "require", "satisfies", "set", "static", "string",
  "symbol", "type", "undefined", "unique", "unknown",
]);

export interface Token {
  token_type?: any;
  type: TokenType;
  value: string;
  raw: string;
  start: number;
  end: number;
  line: number;
  column: number;
  precedingWhitespace: boolean;
  followingWhitespace: boolean;
  precedingLineBreak: boolean;
  followingLineBreak: boolean;
  comments: TokenComment[];
}

export interface TokenComment {
  type: "Line" | "Block";
  value: string;
  start: number;
  end: number;
}

export const PUNCTUATORS = new Set<string>([
  "{", "}", "(", ")", "[", "]", ".", "...", ";", ",", "<", ">", "<=",
  ">=", "==", "!=", "===", "!==", "+", "-", "*", "/", "%", "**", "++",
  "--", "<<", ">>", ">>>", "&", "|", "^", "!", "~", "&&", "||", "??",
  "?", ":", "=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=",
  ">>>=", "&=", "|=", "^=", "&&=", "||=", "??=", "=>", "@", "#",
]);

export const MULTI_CHAR_PUNCTUATORS: Array<[string, TokenType]> = [
  ["...", TokenType.SPREAD],
  ["===", TokenType.STRICT_EQUAL],
  ["!==", TokenType.STRICT_NOT_EQUAL],
  ["**=", TokenType.EXPONENT],
  [">>>=", TokenType.UNSIGNED_RIGHT_SHIFT_ASSIGN],
  ["<<=", TokenType.LEFT_SHIFT_ASSIGN],
  [">>=", TokenType.RIGHT_SHIFT_ASSIGN],
  ["<<=", TokenType.LEFT_SHIFT_ASSIGN],
  ["&&=", TokenType.LOGICAL_AND_ASSIGN],
  ["||=", TokenType.LOGICAL_OR_ASSIGN],
  ["??=", TokenType.LOGICAL_NULLISH_ASSIGN],
  ["==", TokenType.EQUAL],
  ["!=", TokenType.NOT_EQUAL],
  ["<=", TokenType.LESS_EQUAL],
  [">=", TokenType.GREATER_EQUAL],
  ["&&", TokenType.LOGICAL_AND],
  ["||", TokenType.LOGICAL_OR],
  ["??", TokenType.NULLISH],
  ["**", TokenType.EXPONENT],
  ["++", TokenType.INCREMENT],
  ["--", TokenType.DECREMENT],
  ["<<", TokenType.LEFT_SHIFT],
  [">>", TokenType.RIGHT_SHIFT],
  [">>>", TokenType.UNSIGNED_RIGHT_SHIFT],
  ["+=", TokenType.PLUS_ASSIGN],
  ["-=", TokenType.MINUS_ASSIGN],
  ["*=", TokenType.MULTIPLY_ASSIGN],
  ["/=", TokenType.DIVIDE_ASSIGN],
  ["%=", TokenType.MODULO_ASSIGN],
  ["&=", TokenType.BITWISE_AND_ASSIGN],
  ["|=", TokenType.BITWISE_OR_ASSIGN],
  ["^=", TokenType.BITWISE_XOR_ASSIGN],
  ["=>", TokenType.ARROW],
  ["?.", TokenType.OPTIONAL_CHAIN],
];

export const SINGLE_CHAR_PUNCTUATORS: Record<string, TokenType> = {
  "{": TokenType.LEFT_BRACE,
  "}": TokenType.RIGHT_BRACE,
  "(": TokenType.LEFT_PAREN,
  ")": TokenType.RIGHT_PAREN,
  "[": TokenType.LEFT_BRACKET,
  "]": TokenType.RIGHT_BRACKET,
  ".": TokenType.DOT,
  ";": TokenType.SEMICOLON,
  ",": TokenType.COMMA,
  "<": TokenType.PUNCTUATOR,
  ">": TokenType.PUNCTUATOR,
  "+": TokenType.PLUS,
  "-": TokenType.MINUS,
  "*": TokenType.MULTIPLY,
  "/": TokenType.DIVIDE,
  "%": TokenType.MODULO,
  "&": TokenType.BITWISE_AND,
  "|": TokenType.BITWISE_OR,
  "^": TokenType.BITWISE_XOR,
  "!": TokenType.PUNCTUATOR,
  "~": TokenType.BITWISE_NOT,
  "?": TokenType.QUESTION_MARK,
  ":": TokenType.COLON,
  "=": TokenType.ASSIGN,
  "@": TokenType.AT,
  "#": TokenType.HASH,
  "$": TokenType.DOLLAR,
  "\\": TokenType.BACKSLASH,
};

export function isKeyword(value: string): boolean {
  return KEYWORDS.has(value);
}

export function isReservedWord(value: string): boolean {
  return RESERVED_WORDS.has(value);
}

export function isContextualKeyword(value: string): boolean {
  return CONTEXTUAL_KEYWORDS.has(value);
}

export function isStrictModeReserved(value: string): boolean {
  return STRICT_MODE_RESERVED.has(value);
}

export function isIdentifierStart(char: string): boolean {
  return /[a-zA-Z_$]/.test(char);
}

export function isIdentifierPart(char: string): boolean {
  return /[a-zA-Z0-9_$]/.test(char);
}

export function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

export function isHexDigit(char: string): boolean {
  return /[0-9a-fA-F]/.test(char);
}

export function isOctalDigit(char: string): boolean {
  return char >= "0" && char <= "7";
}

export function isBinaryDigit(char: string): boolean {
  return char === "0" || char === "1";
}

export function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

export function isLineBreak(char: string): boolean {
  return char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029";
}

export function isPunctuator(value: string): boolean {
  return PUNCTUATORS.has(value);
}

export function createToken(type: TokenType, value: string, start: number, end: number, line: number, column: number): Token {
  return {
    type,
    value,
    raw: value,
    start,
    end,
    line,
    column,
    precedingWhitespace: false,
    followingWhitespace: false,
    precedingLineBreak: false,
    followingLineBreak: false,
    comments: [],
  };
}

export function createEOFToken(start: number, line: number, column: number): Token {
  return createToken(TokenType.EOF, "", start, start, line, column);
}

export function createUnknownToken(value: string, start: number, end: number, line: number, column: number): Token {
  return createToken(TokenType.UNKNOWN, value, start, end, line, column);
}

export function tokenTypeToString(type: TokenType): string {
  return type;
}

export function stringToTokenType(value: string): TokenType {
  for (const [key, val] of Object.entries(TokenType)) {
    if (val === value) return key as unknown as TokenType;
  }
  return TokenType.UNKNOWN;
}

export function isLiteralToken(type: TokenType): boolean {
  return [
    TokenType.NUMBER_LITERAL,
    TokenType.STRING_LITERAL,
    TokenType.CHAR_LITERAL,
    TokenType.REGEX_LITERAL,
    TokenType.TEMPLATE_LITERAL,
    TokenType.BOOLEAN_LITERAL,
    TokenType.NULL_LITERAL,
    TokenType.UNDEFINED_LITERAL,
    TokenType.BIGINT_LITERAL,
  ].includes(type);
}

export function isOperatorToken(type: TokenType): boolean {
  return [
    TokenType.PLUS, TokenType.MINUS, TokenType.MULTIPLY, TokenType.DIVIDE,
    TokenType.MODULO, TokenType.EXPONENT, TokenType.ASSIGN, TokenType.EQUAL,
    TokenType.NOT_EQUAL, TokenType.STRICT_EQUAL, TokenType.STRICT_NOT_EQUAL,
    TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL, TokenType.LOGICAL_AND,
    TokenType.LOGICAL_OR, TokenType.LOGICAL_NULLISH, TokenType.BITWISE_AND,
    TokenType.BITWISE_OR, TokenType.BITWISE_XOR, TokenType.BITWISE_NOT,
    TokenType.LEFT_SHIFT, TokenType.RIGHT_SHIFT, TokenType.UNSIGNED_RIGHT_SHIFT,
    TokenType.INCREMENT, TokenType.DECREMENT, TokenType.PLUS_ASSIGN,
    TokenType.MINUS_ASSIGN, TokenType.MULTIPLY_ASSIGN, TokenType.DIVIDE_ASSIGN,
    TokenType.MODULO_ASSIGN, TokenType.EXPONENT, TokenType.BITWISE_AND_ASSIGN,
    TokenType.BITWISE_OR_ASSIGN, TokenType.BITWISE_XOR_ASSIGN,
    TokenType.LEFT_SHIFT_ASSIGN, TokenType.RIGHT_SHIFT_ASSIGN,
    TokenType.UNSIGNED_RIGHT_SHIFT_ASSIGN, TokenType.LOGICAL_AND_ASSIGN,
    TokenType.LOGICAL_OR_ASSIGN, TokenType.LOGICAL_NULLISH_ASSIGN,
    TokenType.ARROW, TokenType.SPREAD, TokenType.NULLISH,
  ].includes(type);
}

export function isAssignmentToken(type: TokenType): boolean {
  return [
    TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN,
    TokenType.MULTIPLY_ASSIGN, TokenType.DIVIDE_ASSIGN, TokenType.MODULO_ASSIGN,
    TokenType.EXPONENT, TokenType.BITWISE_AND_ASSIGN, TokenType.BITWISE_OR_ASSIGN,
    TokenType.BITWISE_XOR_ASSIGN, TokenType.LEFT_SHIFT_ASSIGN,
    TokenType.RIGHT_SHIFT_ASSIGN, TokenType.UNSIGNED_RIGHT_SHIFT_ASSIGN,
    TokenType.LOGICAL_AND_ASSIGN, TokenType.LOGICAL_OR_ASSIGN,
    TokenType.LOGICAL_NULLISH_ASSIGN,
  ].includes(type);
}

export function isUnaryOperatorToken(type: TokenType): boolean {
  return [
    TokenType.PLUS, TokenType.MINUS, TokenType.BITWISE_NOT, TokenType.PUNCTUATOR,
    (TokenType as any).VOID, (TokenType as any).TYPEOF, (TokenType as any).DELETE, TokenType.INCREMENT,
    TokenType.DECREMENT,
  ].includes(type);
}

export function isBinaryOperatorToken(type: TokenType): boolean {
  return [
    TokenType.PLUS, TokenType.MINUS, TokenType.MULTIPLY, TokenType.DIVIDE,
    TokenType.MODULO, TokenType.EXPONENT, TokenType.EQUAL, TokenType.NOT_EQUAL,
    TokenType.STRICT_EQUAL, TokenType.STRICT_NOT_EQUAL, TokenType.LESS_EQUAL,
    TokenType.GREATER_EQUAL, TokenType.LOGICAL_AND, TokenType.LOGICAL_OR,
    TokenType.LOGICAL_NULLISH, TokenType.BITWISE_AND, TokenType.BITWISE_OR,
    TokenType.BITWISE_XOR, TokenType.LEFT_SHIFT, TokenType.RIGHT_SHIFT,
    TokenType.UNSIGNED_RIGHT_SHIFT, TokenType.NULLISH,
  ].includes(type);
}

export function isLogicalOperatorToken(type: TokenType): boolean {
  return [
    TokenType.LOGICAL_AND, TokenType.LOGICAL_OR, TokenType.LOGICAL_NULLISH,
  ].includes(type);
}

export function isBitwiseOperatorToken(type: TokenType): boolean {
  return [
    TokenType.BITWISE_AND, TokenType.BITWISE_OR, TokenType.BITWISE_XOR,
    TokenType.BITWISE_NOT, TokenType.LEFT_SHIFT, TokenType.RIGHT_SHIFT,
    TokenType.UNSIGNED_RIGHT_SHIFT,
  ].includes(type);
}

export function isComparisonToken(type: TokenType): boolean {
  return [
    TokenType.EQUAL, TokenType.NOT_EQUAL, TokenType.STRICT_EQUAL,
    TokenType.STRICT_NOT_EQUAL, TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL,
    TokenType.PUNCTUATOR,
  ].includes(type);
}

export function isPunctuatorToken(type: TokenType): boolean {
  return [
    TokenType.LEFT_BRACE, TokenType.RIGHT_BRACE, TokenType.LEFT_PAREN,
    TokenType.RIGHT_PAREN, TokenType.LEFT_BRACKET, TokenType.RIGHT_BRACKET,
    TokenType.DOT, TokenType.SEMICOLON, TokenType.COMMA, TokenType.COLON,
    TokenType.QUESTION_MARK, TokenType.AT, TokenType.HASH, TokenType.DOLLAR,
    TokenType.OPTIONAL_CHAIN, TokenType.SPREAD, TokenType.ARROW,
  ].includes(type);
}

export function isKeywordToken(type: TokenType): boolean {
  return type === TokenType.KEYWORD;
}

export function isIdentifierToken(type: TokenType): boolean {
  return type === TokenType.IDENTIFIER;
}

export function isEOFToken(type: TokenType): boolean {
  return type === TokenType.EOF;
}

export function isUnknownToken(type: TokenType): boolean {
  return type === TokenType.UNKNOWN;
}

export function isWhitespaceToken(type: TokenType): boolean {
  return type === TokenType.WHITESPACE;
}

export function isCommentToken(type: TokenType): boolean {
  return type === TokenType.COMMENT || type === TokenType.LINE_COMMENT || type === TokenType.BLOCK_COMMENT;
}

export function isNewlineToken(type: TokenType): boolean {
  return type === TokenType.NEWLINE;
}

export function getTokenName(type: TokenType): string {
  return Object.entries(TokenType).find(([, v]) => v === type)?.[0] ?? "UNKNOWN";
}

export function getTokenValue(type: TokenType): string {
  return type;
}

export function getTokenDescription(type: TokenType): string {
  const name = getTokenName(type);
  return `${name} (${type})`;
}

export function getOperatorPrecedence(type: TokenType): number {
  switch (type) {
    case TokenType.EXPONENT: return 15;
    case TokenType.MULTIPLY:
    case TokenType.DIVIDE:
    case TokenType.MODULO: return 14;
    case TokenType.PLUS:
    case TokenType.MINUS: return 13;
    case TokenType.LEFT_SHIFT:
    case TokenType.RIGHT_SHIFT:
    case TokenType.UNSIGNED_RIGHT_SHIFT: return 12;
    case TokenType.LESS_EQUAL:
    case TokenType.GREATER_EQUAL:
    case TokenType.PUNCTUATOR: return 11;
    case TokenType.EQUAL:
    case TokenType.NOT_EQUAL:
    case TokenType.STRICT_EQUAL:
    case TokenType.STRICT_NOT_EQUAL: return 10;
    case TokenType.BITWISE_AND: return 9;
    case TokenType.BITWISE_XOR: return 8;
    case TokenType.BITWISE_OR: return 7;
    case TokenType.LOGICAL_AND: return 6;
    case TokenType.LOGICAL_OR: return 5;
    case TokenType.LOGICAL_NULLISH: return 4;
    case TokenType.QUESTION_MARK: return 3;
    case TokenType.ASSIGN:
    case TokenType.PLUS_ASSIGN:
    case TokenType.MINUS_ASSIGN:
    case TokenType.MULTIPLY_ASSIGN:
    case TokenType.DIVIDE_ASSIGN:
    case TokenType.MODULO_ASSIGN:
    case TokenType.BITWISE_AND_ASSIGN:
    case TokenType.BITWISE_OR_ASSIGN:
    case TokenType.BITWISE_XOR_ASSIGN:
    case TokenType.LEFT_SHIFT_ASSIGN:
    case TokenType.RIGHT_SHIFT_ASSIGN:
    case TokenType.UNSIGNED_RIGHT_SHIFT_ASSIGN:
    case TokenType.LOGICAL_AND_ASSIGN:
    case TokenType.LOGICAL_OR_ASSIGN:
    case TokenType.LOGICAL_NULLISH_ASSIGN: return 2;
    case TokenType.ARROW: return 1;
    default: return 0;
  }
}

export function isRightAssociative(type: TokenType): boolean {
  return [
    TokenType.EXPONENT, TokenType.ASSIGN, TokenType.PLUS_ASSIGN,
    TokenType.MINUS_ASSIGN, TokenType.MULTIPLY_ASSIGN, TokenType.DIVIDE_ASSIGN,
    TokenType.MODULO_ASSIGN, TokenType.BITWISE_AND_ASSIGN,
    TokenType.BITWISE_OR_ASSIGN, TokenType.BITWISE_XOR_ASSIGN,
    TokenType.LEFT_SHIFT_ASSIGN, TokenType.RIGHT_SHIFT_ASSIGN,
    TokenType.UNSIGNED_RIGHT_SHIFT_ASSIGN, TokenType.LOGICAL_AND_ASSIGN,
    TokenType.LOGICAL_OR_ASSIGN, TokenType.LOGICAL_NULLISH_ASSIGN,
    TokenType.ARROW, TokenType.QUESTION_MARK,
  ].includes(type);
}

export function isLeftAssociative(type: TokenType): boolean {
  return !isRightAssociative(type);
}

export function isAssociative(type: TokenType): boolean {
  return [
    TokenType.PLUS, TokenType.MULTIPLY, TokenType.LOGICAL_AND,
    TokenType.LOGICAL_OR, TokenType.LOGICAL_NULLISH, TokenType.BITWISE_AND,
    TokenType.BITWISE_OR, TokenType.BITWISE_XOR,
  ].includes(type);
}

export function isCommutative(type: TokenType): boolean {
  return [
    TokenType.PLUS, TokenType.MULTIPLY, TokenType.LOGICAL_AND,
    TokenType.LOGICAL_OR, TokenType.LOGICAL_NULLISH, TokenType.BITWISE_AND,
    TokenType.BITWISE_OR, TokenType.BITWISE_XOR,
  ].includes(type);
}

export function isDistributive(type: TokenType): boolean {
  return [
    TokenType.MULTIPLY, TokenType.LOGICAL_AND, TokenType.BITWISE_AND,
  ].includes(type);
}

export function getAssociativity(type: TokenType): "left" | "right" | "none" {
  if (isRightAssociative(type)) return "right";
  if (isLeftAssociative(type) && getOperatorPrecedence(type) > 0) return "left";
  return "none";
}

export function comparePrecedence(a: TokenType, b: TokenType): number {
  return getOperatorPrecedence(a) - getOperatorPrecedence(b);
}

export function hasHigherPrecedence(a: TokenType, b: TokenType): boolean {
  return getOperatorPrecedence(a) > getOperatorPrecedence(b);
}

export function hasEqualPrecedence(a: TokenType, b: TokenType): boolean {
  return getOperatorPrecedence(a) === getOperatorPrecedence(b);
}

export function hasLowerPrecedence(a: TokenType, b: TokenType): boolean {
  return getOperatorPrecedence(a) < getOperatorPrecedence(b);
}

export function tokenToString(token: Token): string {
  return `${getTokenName(token.type)}('${token.value}') at ${token.line}:${token.column}`;
}

export function tokenToJSON(token: Token): string {
  return JSON.stringify({
    type: token.type,
    value: token.value,
    start: token.start,
    end: token.end,
    line: token.line,
    column: token.column,
  });
}

export function tokensToArray(tokens: Token[]): Array<{ type: string; value: string; line: number; column: number }> {
  return tokens.map((t) => ({ type: getTokenName(t.type), value: t.value, line: t.line, column: t.column }));
}

export function tokensToString(tokens: Token[]): string {
  return tokens.map((t) => t.value).join("");
}

export function tokensToJSON(tokens: Token[]): string {
  return JSON.stringify(tokensToArray(tokens), null, 2);
}

export function filterTokens(tokens: Token[], type: TokenType): Token[] {
  return tokens.filter((t) => t.type === type);
}

export function filterTokensByType(tokens: Token[], types: TokenType[]): Token[] {
  const typeSet = new Set(types);
  return tokens.filter((t) => typeSet.has(t.type));
}

export function filterOutTokens(tokens: Token[], type: TokenType): Token[] {
  return tokens.filter((t) => t.type !== type);
}

export function filterOutTokensByType(tokens: Token[], types: TokenType[]): Token[] {
  const typeSet = new Set(types);
  return tokens.filter((t) => !typeSet.has(t.type));
}

export function filterWhitespace(tokens: Token[]): Token[] {
  return tokens.filter((t) => !isWhitespaceToken(t.type));
}

export function filterComments(tokens: Token[]): Token[] {
  return tokens.filter((t) => !isCommentToken(t.type));
}

export function filterWhitespaceAndComments(tokens: Token[]): Token[] {
  return tokens.filter((t) => !isWhitespaceToken(t.type) && !isCommentToken(t.type));
}

export function filterNewlines(tokens: Token[]): Token[] {
  return tokens.filter((t) => !isNewlineToken(t.type));
}

export function findToken(tokens: Token[], type: TokenType): Token | undefined {
  return tokens.find((t) => t.type === type);
}

export function findTokenByValue(tokens: Token[], value: string): Token | undefined {
  return tokens.find((t) => t.value === value);
}

export function findTokenIndex(tokens: Token[], type: TokenType): number {
  return tokens.findIndex((t) => t.type === type);
}

export function findTokenIndexByValue(tokens: Token[], value: string): number {
  return tokens.findIndex((t) => t.value === value);
}

export function findLastToken(tokens: Token[], type: TokenType): Token | undefined {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === type) return tokens[i];
  }
  return undefined;
}

export function findLastTokenIndex(tokens: Token[], type: TokenType): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === type) return i;
  }
  return -1;
}

export function countTokens(tokens: Token[], type: TokenType): number {
  return tokens.filter((t) => t.type === type).length;
}

export function countTokensByValue(tokens: Token[], value: string): number {
  return tokens.filter((t) => t.value === value).length;
}

export function countKeywords(tokens: Token[]): number {
  return countTokens(tokens, TokenType.KEYWORD);
}

export function countIdentifiers(tokens: Token[]): number {
  return countTokens(tokens, TokenType.IDENTIFIER);
}

export function countLiterals(tokens: Token[]): number {
  return tokens.filter((t) => isLiteralToken(t.type)).length;
}

export function countOperators(tokens: Token[]): number {
  return tokens.filter((t) => isOperatorToken(t.type)).length;
}

export function countPunctuators(tokens: Token[]): number {
  return tokens.filter((t) => isPunctuatorToken(t.type)).length;
}

export function countComments(tokens: Token[]): number {
  return tokens.filter((t) => isCommentToken(t.type)).length;
}

export function countWhitespace(tokens: Token[]): number {
  return tokens.filter((t) => isWhitespaceToken(t.type)).length;
}

export function countNewlines(tokens: Token[]): number {
  return tokens.filter((t) => isNewlineToken(t.type)).length;
}

export function getTokenAtPosition(tokens: Token[], position: number): Token | undefined {
  return tokens.find((t) => t.start <= position && t.end > position);
}

export function getTokenAtLineColumn(tokens: Token[], line: number, column: number): Token | undefined {
  return tokens.find((t) => t.line === line && t.column <= column && t.column + t.value.length > column);
}

export function getTokensInRange(tokens: Token[], start: number, end: number): Token[] {
  return tokens.filter((t) => t.start >= start && t.end <= end);
}

export function getTokensInLineRange(tokens: Token[], startLine: number, endLine: number): Token[] {
  return tokens.filter((t) => t.line >= startLine && t.line <= endLine);
}

export function getTokenRanges(tokens: Token[]): Array<{ start: number; end: number; token: Token }> {
  return tokens.map((t) => ({ start: t.start, end: t.end, token: t }));
}

export function mergeTokens(tokens: Token[], separator: string = ""): string {
  return tokens.map((t) => t.value).join(separator);
}

export function splitTokens(tokens: Token[], type: TokenType): Token[][] {
  const result: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.type === type) {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function splitTokensByValue(tokens: Token[], value: string): Token[][] {
  const result: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.value === value) {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function groupTokens(tokens: Token[], type: TokenType): Token[][] {
  const result: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.type === type) {
      current.push(token);
    } else {
      if (current.length > 0) {
        result.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function adjacentTokens(tokens: Token[]): Array<[Token | undefined, Token, Token | undefined]> {
  const result: Array<[Token | undefined, Token, Token | undefined]> = [];
  for (let i = 0; i < tokens.length; i++) {
    result.push([tokens[i - 1], tokens[i], tokens[i + 1]]);
  }
  return result;
}

export function pairwiseTokens(tokens: Token[]): Array<[Token, Token]> {
  const result: Array<[Token, Token]> = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push([tokens[i], tokens[i + 1]]);
  }
  return result;
}

export function isTokenBefore(token: Token, other: Token): boolean {
  return token.end <= other.start;
}

export function isTokenAfter(token: Token, other: Token): boolean {
  return token.start >= other.end;
}

export function isTokenAdjacent(token: Token, other: Token): boolean {
  return token.end === other.start || other.end === token.start;
}

export function getTokenDistance(token: Token, other: Token): number {
  if (token.end <= other.start) return other.start - token.end;
  if (other.end <= token.start) return token.start - other.end;
  return 0;
}

export function getTokenLineDistance(token: Token, other: Token): number {
  return Math.abs(token.line - other.line);
}

export function getTokenColumnDistance(token: Token, other: Token): number {
  return Math.abs(token.column - other.column);
}

export function cloneToken(token: Token): Token {
  return { ...token, comments: [...token.comments] };
}

export function cloneTokens(tokens: Token[]): Token[] {
  return tokens.map(cloneToken);
}

export function compareTokens(a: Token, b: Token): number {
  if (a.start !== b.start) return a.start - b.start;
  return a.end - b.end;
}

export function sortTokens(tokens: Token[]): Token[] {
  return [...tokens].sort(compareTokens);
}

export function uniqueTokens(tokens: Token[]): Token[] {
  const seen = new Set<number>();
  const result: Token[] = [];
  for (const token of tokens) {
    if (!seen.has(token.start)) {
      seen.add(token.start);
      result.push(token);
    }
  }
  return result;
}

export function deduplicateTokens(tokens: Token[]): Token[] {
  return uniqueTokens(tokens);
}

export function getTokenStats(tokens: Token[]): {
  total: number;
  keywords: number;
  identifiers: number;
  literals: number;
  operators: number;
  punctuators: number;
  comments: number;
  whitespace: number;
  newlines: number;
  unknown: number;
} {
  return {
    total: tokens.length,
    keywords: countKeywords(tokens),
    identifiers: countIdentifiers(tokens),
    literals: countLiterals(tokens),
    operators: countOperators(tokens),
    punctuators: countPunctuators(tokens),
    comments: countComments(tokens),
    whitespace: countWhitespace(tokens),
    newlines: countNewlines(tokens),
    unknown: countTokens(tokens, TokenType.UNKNOWN),
  };
}

export function getTokenFrequency(tokens: Token[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    const key = `${token.type}:${token.value}`;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
}

export function getTokenTypeFrequency(tokens: Token[]): Map<TokenType, number> {
  const freq = new Map<TokenType, number>();
  for (const token of tokens) {
    freq.set(token.type, (freq.get(token.type) ?? 0) + 1);
  }
  return freq;
}

export function getTokenValueFrequency(tokens: Token[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token.value, (freq.get(token.value) ?? 0) + 1);
  }
  return freq;
}

export function getMostFrequentTokens(tokens: Token[], count: number = 10): Array<{ token: Token; count: number }> {
  const freq = getTokenFrequency(tokens);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, count]) => ({ token: tokens.find((t) => `${t.type}:${t.value}` === key)!, count }));
}

export function getMostFrequentTokenTypes(tokens: Token[], count: number = 10): Array<{ type: TokenType; count: number }> {
  const freq = getTokenTypeFrequency(tokens);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([type, count]) => ({ type, count }));
}

export function getTokenLengths(tokens: Token[]): number[] {
  return tokens.map((t) => t.end - t.start);
}

export function getAverageTokenLength(tokens: Token[]): number {
  if (tokens.length === 0) return 0;
  const lengths = getTokenLengths(tokens);
  return lengths.reduce((a, b) => a + b, 0) / lengths.length;
}

export function getMinTokenLength(tokens: Token[]): number {
  if (tokens.length === 0) return 0;
  return Math.min(...getTokenLengths(tokens));
}

export function getMaxTokenLength(tokens: Token[]): number {
  if (tokens.length === 0) return 0;
  return Math.max(...getTokenLengths(tokens));
}

export function getTotalTokenLength(tokens: Token[]): number {
  return getTokenLengths(tokens).reduce((a, b) => a + b, 0);
}

export function getTokenDensity(tokens: Token[]): number {
  if (tokens.length === 0) return 0;
  const totalLength = getTotalTokenLength(tokens);
  const span = tokens[tokens.length - 1].end - tokens[0].start;
  return span > 0 ? totalLength / span : 0;
}

export function getTokenLineCount(tokens: Token[]): number {
  if (tokens.length === 0) return 0;
  return tokens[tokens.length - 1].line - tokens[0].line + 1;
}

export function getTokenColumnCount(tokens: Token[]): number {
  if (tokens.length === 0) return 0;
  let maxColumn = 0;
  for (const token of tokens) {
    maxColumn = Math.max(maxColumn, token.column + token.value.length);
  }
  return maxColumn;
}

export function getTokenBoundingBox(tokens: Token[]): { startLine: number; endLine: number; startColumn: number; endColumn: number } {
  if (tokens.length === 0) return { startLine: 0, endLine: 0, startColumn: 0, endColumn: 0 };
  const startLine = tokens[0].line;
  const endLine = tokens[tokens.length - 1].line;
  const startColumn = tokens[0].column;
  let endColumn = 0;
  for (const token of tokens) {
    endColumn = Math.max(endColumn, token.column + token.value.length);
  }
  return { startLine, endLine, startColumn, endColumn };
}

export function getTokenSummary(tokens: Token[]): string {
  const stats = getTokenStats(tokens);
  return JSON.stringify(stats, null, 2);
}

export function tokensToTable(tokens: Token[]): string {
  const header = "Type\tValue\tLine\tColumn\tStart\tEnd";
  const rows = tokens.map((t) => `${getTokenName(t.type)}\t${t.value}\t${t.line}\t${t.column}\t${t.start}\t${t.end}`);
  return [header, ...rows].join("\n");
}

export function tokensToCSV(tokens: Token[]): string {
  const header = "Type,Value,Line,Column,Start,End";
  const rows = tokens.map((t) => `${getTokenName(t.type)},"${t.value.replace(/"/g, '""')}",${t.line},${t.column},${t.start},${t.end}`);
  return [header, ...rows].join("\n");
}
