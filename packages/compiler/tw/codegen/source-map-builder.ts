/**
 * Source map builder -- constructs source maps for compiled output.
 * @module compiler/codegen
 */

export interface SourceMapEntry {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
  source: string;
  name?: string;
}

export interface SourceMapOptions {
  file: string;
  sourceRoot?: string;
  includeSources?: boolean;
  includeNames?: boolean;
  inlineSources?: boolean;
}

export class SourceMapBuilder {
  private entries: SourceMapEntry[] = [];
  private sources: Set<string> = new Set();
  private names: Set<string> = new Set();
  private options: SourceMapOptions;
  private sourceContents: Map<string, string> = new Map();

  constructor(options?: Partial<SourceMapOptions>) {
    this.options = {
      file: options?.file ?? "output.js",
      sourceRoot: options?.sourceRoot ?? "",
      includeSources: options?.includeSources ?? false,
      includeNames: options?.includeNames ?? true,
      inlineSources: options?.inlineSources ?? false,
    };
  }

  addEntry(entry: SourceMapEntry): this {
    this.entries.push(entry);
    this.sources.add(entry.source);
    if (entry.name) {
      this.names.add(entry.name);
    }
    return this;
  }

  /** Register a source file, optionally with its content. */
  addSource(source: string, content?: string): this {
    this.sources.add(source);
    if (content !== undefined) this.setSourceContent(source, content);
    return this;
  }

  /** Register a name referenced by a mapping (e.g. a renamed identifier). */
  addName(name: string): this {
    this.names.add(name);
    return this;
  }

  /** Add a mapping keyed by `sourceIndex` into the sources added so far
   *  (via `addSource`), as opposed to `addEntry`'s `source` string. */
  addMapping(entry: {
    generatedLine: number;
    generatedColumn: number;
    sourceIndex?: number;
    originalLine?: number;
    originalColumn?: number;
    name?: string;
  }): this {
    const sourcesArray = [...this.sources];
    const source = entry.sourceIndex !== undefined ? sourcesArray[entry.sourceIndex] : undefined;
    this.entries.push({
      generatedLine: entry.generatedLine,
      generatedColumn: entry.generatedColumn,
      originalLine: entry.originalLine ?? 0,
      originalColumn: entry.originalColumn ?? 0,
      source: source ?? "",
      name: entry.name,
    });
    if (entry.name) this.names.add(entry.name);
    return this;
  }

  /** Build a plain source-map object (always including `sourcesContent`,
   *  unlike `toJSON()` which only includes it per the builder's options). */
  build(): { version: number; file: string; sourceRoot: string; sources: string[]; sourcesContent: (string | null)[]; names: string[]; mappings: string } {
    const sourcesArray = [...this.sources];
    const namesArray = [...this.names];
    return {
      version: 3,
      file: this.options.file,
      sourceRoot: this.options.sourceRoot,
      sources: sourcesArray,
      sourcesContent: sourcesArray.map((s) => this.sourceContents.get(s) ?? null),
      names: namesArray,
      mappings: this.encodeMappings(sourcesArray, namesArray),
    };
  }

  setSourceContent(source: string, content: string): this {
    this.sourceContents.set(source, content);
    return this;
  }

  getEntries(): SourceMapEntry[] {
    return [...this.entries];
  }

  getSources(): string[] {
    return [...this.sources];
  }

  getNames(): string[] {
    return [...this.names];
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  getSourceCount(): number {
    return this.sources.size;
  }

  getNameCount(): number {
    return this.names.size;
  }

  clear(): this {
    this.entries = [];
    this.sources.clear();
    this.names.clear();
    this.sourceContents.clear();
    return this;
  }

  toJSON(file?: string): { version: number; file: string; sourceRoot: string; sources: string[]; sourcesContent?: string[]; names: string[]; mappings: string } | string {
    const sourcesArray = [...this.sources];
    const namesArray = [...this.names];
    const result: { version: number; file: string; sourceRoot: string; sources: string[]; sourcesContent?: string[]; names: string[]; mappings: string } = {
      version: 3,
      file: file ?? this.options.file,
      sourceRoot: this.options.sourceRoot,
      sources: sourcesArray,
      names: namesArray,
      mappings: this.encodeMappings(sourcesArray, namesArray),
    };
    if (this.options.includeSources || this.options.inlineSources) {
      result.sourcesContent = sourcesArray.map((s) => this.sourceContents.get(s) ?? null);
    }
    // Called with an explicit file name (e.g. `toJSON("output.js")`) -> return
    // the serialized JSON string. Called with no args (internal use by
    // toBase64()/toInlineComment() below) -> return the plain object, as before.
    return file !== undefined ? JSON.stringify(result) : result;
  }

  toBase64(): string {
    const json = JSON.stringify(this.toJSON());
    if (typeof btoa !== "undefined") return btoa(json);
    if (typeof Buffer !== "undefined") return Buffer.from(json).toString("base64");
    return "";
  }

  toComment(): string {
    return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${this.toBase64()}`;
  }

  toInlineComment(): string {
    return `//# sourceMappingURL=data:application/json;charset=utf-8,${JSON.stringify(this.toJSON())}`;
  }

  private encodeMappings(sourcesArray: string[], namesArray: string[]): string {
    const sorted = [...this.entries].sort((a, b) => a.generatedLine - b.generatedLine || a.generatedColumn - b.generatedColumn);
    let result = "";
    let prevGeneratedLine = 0;
    let prevGeneratedColumn = 0;
    let prevOriginalLine = 0;
    let prevOriginalColumn = 0;
    let prevSourceIndex = 0;
    let prevNameIndex = 0;
    for (const entry of sorted) {
      while (prevGeneratedLine < entry.generatedLine) {
        result += ";";
        prevGeneratedLine++;
        prevGeneratedColumn = 0;
      }
      if (result.length > 0 && result[result.length - 1] !== ";") {
        result += ",";
      }
      result += this.encodeVLQ(entry.generatedColumn - prevGeneratedColumn);
      prevGeneratedColumn = entry.generatedColumn;
      const sourceIndex = sourcesArray.indexOf(entry.source);
      result += this.encodeVLQ(sourceIndex - prevSourceIndex);
      prevSourceIndex = sourceIndex;
      result += this.encodeVLQ(entry.originalLine - prevOriginalLine);
      prevOriginalLine = entry.originalLine;
      result += this.encodeVLQ(entry.originalColumn - prevOriginalColumn);
      prevOriginalColumn = entry.originalColumn;
      if (entry.name && this.options.includeNames) {
        const nameIndex = namesArray.indexOf(entry.name);
        result += this.encodeVLQ(nameIndex - prevNameIndex);
        prevNameIndex = nameIndex;
      }
    }
    return result;
  }

  private encodeVLQ(value: number): string {
    let result = "";
    let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
    const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    do {
      let digit = vlq & 31;
      vlq >>>= 5;
      if (vlq > 0) digit |= 32;
      result += base64Chars[digit];
    } while (vlq > 0);
    return result;
  }

  merge(other: SourceMapBuilder): this {
    for (const entry of other.getEntries()) {
      this.addEntry(entry);
    }
    for (const [source, content] of other.sourceContents) {
      this.setSourceContent(source, content);
    }
    return this;
  }

  getOptions(): SourceMapOptions {
    return { ...this.options };
  }

  setOptions(options: Partial<SourceMapOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  getFile(): string {
    return this.options.file;
  }

  getSourceRoot(): string {
    return this.options.sourceRoot ?? "";
  }

  isIncludeSources(): boolean {
    return this.options.includeSources ?? false;
  }

  isInlineSources(): boolean {
    return this.options.inlineSources ?? false;
  }
}

export function createSourceMapBuilder(options?: Partial<SourceMapOptions>): SourceMapBuilder {
  return new SourceMapBuilder(options);
}

export class SourceMapMerger {
  private maps: SourceMapBuilder[] = [];

  add(map: SourceMapBuilder): this {
    this.maps.push(map);
    return this;
  }

  merge(file: string): SourceMapBuilder {
    let result = new SourceMapBuilder({ file });
    for (const map of this.maps) {
      result.merge(map);
    }
    return result;
  }

  clear(): this {
    this.maps = [];
    return this;
  }

  size(): number {
    return this.maps.length;
  }
}

export function createSourceMapMerger(): SourceMapMerger {
  return new SourceMapMerger();
}

export class ASTPrinter {
  private indent: string = "  ";
  private currentIndent: number = 0;

  constructor(indent: string = "  ") {
    this.indent = indent;
  }

  print(node: unknown): string {
    if (node === null || node === undefined) return "null";
    if (typeof node === "string") return JSON.stringify(node);
    if (typeof node === "number" || typeof node === "boolean") return String(node);
    if (Array.isArray(node)) {
      return `[${node.map((n) => this.print(n)).join(", ")}]`;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const type = obj.type as string;
      if (!type) {
        const entries = Object.entries(obj).map(([key, value]) => `${key}: ${this.print(value)}`);
        return `{ ${entries.join(", ")} }`;
      }
      const fields: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (key === "type") continue;
        if (value === undefined || value === null) continue;
        fields.push(`${key}=${this.print(value)}`);
      }
      return fields.length > 0 ? `${type}(${fields.join(", ")})` : type;
    }
    return String(node);
  }

  prettyPrint(node: unknown): string {
    return this.prettyPrintInternal(node, 0);
  }

  private prettyPrintInternal(node: unknown, depth: number): string {
    const indentation = this.indent.repeat(depth);
    if (node === null || node === undefined) return "null";
    if (typeof node === "string") return JSON.stringify(node);
    if (typeof node === "number" || typeof node === "boolean") return String(node);
    if (Array.isArray(node)) {
      if (node.length === 0) return "[]";
      const items = node.map((n) => this.prettyPrintInternal(n, depth + 1));
      return `[\n${indentation}${this.indent}${items.join(`,\n${indentation}${this.indent}`)}\n${indentation}]`;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const type = obj.type as string;
      if (!type) {
        const entries = Object.entries(obj).map(([key, value]) => `${key}: ${this.prettyPrintInternal(value, depth + 1)}`);
        return `{\n${indentation}${this.indent}${entries.join(`,\n${indentation}${this.indent}`)}\n${indentation}}`;
      }
      const fields: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (key === "type") continue;
        if (value === undefined || value === null) continue;
        fields.push(`${key}=${this.prettyPrintInternal(value, depth + 1)}`);
      }
      return fields.length > 0 ? `${type}(\n${indentation}${this.indent}${fields.join(`,\n${indentation}${this.indent}`)}\n${indentation})` : type;
    }
    return String(node);
  }

  toJSON(node: unknown): string {
    return JSON.stringify(node, null, 2);
  }

  toCompactJSON(node: unknown): string {
    return JSON.stringify(node);
  }

  setIndent(indent: string): void {
    this.indent = indent;
  }

  getIndent(): string {
    return this.indent;
  }
}

export function createASTPrinter(indent?: string): ASTPrinter {
  return new ASTPrinter(indent);
}

export class TransformerPass {
  private name: string;
  private transform: (node: unknown) => unknown;
  private visitedNodes: number = 0;
  private transformedNodes: number = 0;
  private errors: Array<{ message: string; node?: unknown }> = [];
  private warnings: Array<{ message: string; node?: unknown }> = [];
  private enabled: boolean = true;

  constructor(name: string, transform: (node: unknown) => unknown) {
    this.name = name;
    this.transform = transform;
  }

  run(ast: unknown): unknown {
    if (!this.enabled) return ast;
    this.reset();
    return this.visit(ast);
  }

  private visit(node: unknown): unknown {
    if (node === null || typeof node !== "object") return node;
    this.visitedNodes++;
    try {
      const transformed = this.transform(node);
      this.transformedNodes++;
      if (Array.isArray(transformed)) {
        return transformed.map((n) => this.visit(n));
      }
      if (typeof transformed === "object" && transformed !== null) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(transformed as Record<string, unknown>)) {
          result[key] = Array.isArray(value) ? value.map((v) => this.visit(v)) : typeof value === "object" && value !== null ? this.visit(value) : value;
        }
        return result;
      }
      return transformed;
    } catch (error) {
      this.errors.push({ message: String(error), node });
      return node;
    }
  }

  reset(): void {
    this.visitedNodes = 0;
    this.transformedNodes = 0;
    this.errors = [];
    this.warnings = [];
  }

  getName(): string {
    return this.name;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  getStats(): { name: string; visitedNodes: number; transformedNodes: number; errorCount: number; warningCount: number; transformationRate: number } {
    return {
      name: this.name,
      visitedNodes: this.visitedNodes,
      transformedNodes: this.transformedNodes,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      transformationRate: this.visitedNodes > 0 ? this.transformedNodes / this.visitedNodes : 0,
    };
  }

  getErrors(): Array<{ message: string; node?: unknown }> {
    return [...this.errors];
  }

  getWarnings(): Array<{ message: string; node?: unknown }> {
    return [...this.warnings];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  addWarning(message: string, node?: unknown): void {
    this.warnings.push({ message, node });
  }

  addError(message: string, node?: unknown): void {
    this.errors.push({ message, node });
  }

  clearErrors(): void {
    this.errors = [];
  }

  clearWarnings(): void {
    this.warnings = [];
  }
}

export function createTransformerPass(name: string, transform: (node: unknown) => unknown): TransformerPass {
  return new TransformerPass(name, transform);
}

export class Pipeline {
  private passes: TransformerPass[] = [];
  private beforeHandlers: Array<(ast: unknown) => unknown> = [];
  private afterHandlers: Array<(ast: unknown) => unknown> = [];

  addPass(pass: TransformerPass): this {
    this.passes.push(pass);
    return this;
  }

  removePass(name: string): this {
    this.passes = this.passes.filter((p) => p.getName() !== name);
    return this;
  }

  before(handler: (ast: unknown) => unknown): this {
    this.beforeHandlers.push(handler);
    return this;
  }

  after(handler: (ast: unknown) => unknown): this {
    this.afterHandlers.push(handler);
    return this;
  }

  run(ast: unknown): unknown {
    let result = ast;
    for (const handler of this.beforeHandlers) {
      result = handler(result);
    }
    for (const pass of this.passes) {
      result = pass.run(result);
    }
    for (const handler of this.afterHandlers) {
      result = handler(result);
    }
    return result;
  }

  getPasses(): TransformerPass[] {
    return [...this.passes];
  }

  getPass(name: string): TransformerPass | undefined {
    return this.passes.find((p) => p.getName() === name);
  }

  hasPass(name: string): boolean {
    return this.passes.some((p) => p.getName() === name);
  }

  enablePass(name: string): void {
    const pass = this.getPass(name);
    if (pass) pass.enable();
  }

  disablePass(name: string): void {
    const pass = this.getPass(name);
    if (pass) pass.disable();
  }

  clear(): this {
    this.passes = [];
    this.beforeHandlers = [];
    this.afterHandlers = [];
    return this;
  }

  size(): number {
    return this.passes.length;
  }

  getStats(): Array<{ name: string; visitedNodes: number; transformedNodes: number; errorCount: number; warningCount: number }> {
    return this.passes.map((p) => p.getStats());
  }

  getAllErrors(): Array<{ pass: string; message: string }> {
    const errors: Array<{ pass: string; message: string }> = [];
    for (const pass of this.passes) {
      for (const error of pass.getErrors()) {
        errors.push({ pass: pass.getName(), message: error.message });
      }
    }
    return errors;
  }

  getAllWarnings(): Array<{ pass: string; message: string }> {
    const warnings: Array<{ pass: string; message: string }> = [];
    for (const pass of this.passes) {
      for (const warning of pass.getWarnings()) {
        warnings.push({ pass: pass.getName(), message: warning.message });
      }
    }
    return warnings;
  }

  hasErrors(): boolean {
    return this.passes.some((p) => p.hasErrors());
  }

  hasWarnings(): boolean {
    return this.passes.some((p) => p.hasWarnings());
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createPipeline(): Pipeline {
  return new Pipeline();
}

export class SymbolTable {
  private symbols: Map<string, { name: string; type: string; scope: number; kind: string; value?: unknown; mutable: boolean; initialized: boolean }> = new Map();
  private scopes: Array<Set<string>> = [new Set()];
  private currentScope: number = 0;

  enterScope(): void {
    this.scopes.push(new Set());
    this.currentScope++;
  }

  exitScope(): void {
    if (this.currentScope > 0) {
      const scope = this.scopes.pop()!;
      for (const name of scope) {
        const symbol = this.symbols.get(`${name}_${this.currentScope}`);
        if (symbol) {
          this.symbols.delete(`${name}_${this.currentScope}`);
        }
      }
      this.currentScope--;
    }
  }

  declare(name: string, type: string, kind: string = "variable", mutable: boolean = true): boolean {
    const scope = this.scopes[this.currentScope];
    if (scope.has(name)) {
      return false;
    }
    scope.add(name);
    this.symbols.set(`${name}_${this.currentScope}`, { name, type, scope: this.currentScope, kind, mutable, initialized: false });
    return true;
  }

  lookup(name: string): { name: string; type: string; scope: number; kind: string; value?: unknown; mutable: boolean; initialized: boolean } | undefined {
    for (let i = this.currentScope; i >= 0; i--) {
      const symbol = this.symbols.get(`${name}_${i}`);
      if (symbol) return symbol;
    }
    return undefined;
  }

  has(name: string): boolean {
    return this.lookup(name) !== undefined;
  }

  assign(name: string, value: unknown): boolean {
    const symbol = this.lookup(name);
    if (!symbol || !symbol.mutable) return false;
    symbol.value = value;
    symbol.initialized = true;
    return true;
  }

  initialize(name: string): boolean {
    const symbol = this.lookup(name);
    if (!symbol) return false;
    symbol.initialized = true;
    return true;
  }

  isInitialized(name: string): boolean {
    return this.lookup(name)?.initialized ?? false;
  }

  isMutable(name: string): boolean {
    return this.lookup(name)?.mutable ?? false;
  }

  getType(name: string): string | undefined {
    return this.lookup(name)?.type;
  }

  getKind(name: string): string | undefined {
    return this.lookup(name)?.kind;
  }

  getScope(name: string): number | undefined {
    return this.lookup(name)?.scope;
  }

  getValue(name: string): unknown {
    return this.lookup(name)?.value;
  }

  getCurrentScope(): number {
    return this.currentScope;
  }

  getScopeSymbols(scope: number): string[] {
    return [...(this.scopes[scope] ?? [])];
  }

  getAllSymbols(): Array<{ name: string; type: string; scope: number; kind: string }> {
    return [...this.symbols.values()].map((s) => ({ name: s.name, type: s.type, scope: s.scope, kind: s.kind }));
  }

  getSymbolCount(): number {
    return this.symbols.size;
  }

  getScopeCount(): number {
    return this.scopes.length;
  }

  clear(): void {
    this.symbols.clear();
    this.scopes = [new Set()];
    this.currentScope = 0;
  }

  toJSON(): string {
    return JSON.stringify(this.getAllSymbols(), null, 2);
  }
}

export function createSymbolTable(): SymbolTable {
  return new SymbolTable();
}

export class TypeChecker {
  private symbolTable: SymbolTable;
  private errors: Array<{ message: string; line?: number; column?: number }> = [];
  private warnings: Array<{ message: string; line?: number; column?: number }> = [];

  constructor(symbolTable?: SymbolTable) {
    this.symbolTable = symbolTable ?? new SymbolTable();
  }

  check(node: unknown): boolean {
    this.errors = [];
    this.warnings = [];
    this.visit(node);
    return this.errors.length === 0;
  }

  private visit(node: unknown): void {
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = obj.type as string;
    switch (type) {
      case "VariableDeclaration": this.checkVariableDeclaration(obj); break;
      case "AssignmentExpression": this.checkAssignment(obj); break;
      case "BinaryExpression": this.checkBinaryExpression(obj); break;
      case "CallExpression": this.checkCallExpression(obj); break;
      case "Identifier": this.checkIdentifier(obj); break;
      case "MemberExpression": this.checkMemberExpression(obj); break;
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach((v) => this.visit(v));
      } else if (typeof value === "object" && value !== null) {
        this.visit(value);
      }
    }
  }

  private checkVariableDeclaration(node: Record<string, unknown>): void {
    const declarations = node.declarations as Array<Record<string, unknown>>;
    if (!declarations) return;
    for (const decl of declarations) {
      const id = decl.id as Record<string, unknown>;
      const name = id?.name as string;
      const init = decl.init;
      if (name) {
        const type = init ? this.inferType(init) : "any";
        const kind = node.kind as string;
        this.symbolTable.declare(name, type, kind === "const" ? "constant" : "variable", kind !== "const");
        if (init) {
          this.symbolTable.initialize(name);
        }
      }
    }
  }

  private checkAssignment(node: Record<string, unknown>): void {
    const left = node.left as Record<string, unknown>;
    const name = left?.name as string;
    if (name) {
      if (!this.symbolTable.has(name)) {
        this.errors.push({ message: `Variable "${name}" is not defined` });
      } else if (!this.symbolTable.isMutable(name)) {
        this.errors.push({ message: `Cannot assign to constant "${name}"` });
      } else {
        this.symbolTable.assign(name, undefined);
      }
    }
  }

  private checkBinaryExpression(node: Record<string, unknown>): void {
    const left = node.left;
    const right = node.right;
    const operator = node.operator as string;
    const leftType = this.inferType(left);
    const rightType = this.inferType(right);
    if (operator === "+" && leftType !== "string" && rightType !== "string" && leftType !== "number" && rightType !== "number") {
      this.warnings.push({ message: "Implicit type conversion in addition" });
    }
  }

  private checkCallExpression(node: Record<string, unknown>): void {
    const callee = node.callee as Record<string, unknown>;
    const name = callee?.name as string;
    if (name && !this.symbolTable.has(name)) {
      this.warnings.push({ message: `Function "${name}" might not be defined` });
    }
  }

  private checkIdentifier(node: Record<string, unknown>): void {
    const name = node.name as string;
    if (name && !this.symbolTable.has(name)) {
      this.errors.push({ message: `Variable "${name}" is not defined` });
    }
  }

  private checkMemberExpression(node: Record<string, unknown>): void {
    const object = node.object as Record<string, unknown>;
    if (object?.type === "Identifier") {
      const name = object.name as string;
      if (!this.symbolTable.has(name)) {
        this.warnings.push({ message: `Object "${name}" might not be defined` });
      }
    }
  }

  private inferType(node: unknown): string {
    if (node === null) return "null";
    if (node === undefined) return "undefined";
    if (typeof node === "string") return "string";
    if (typeof node === "number") return "number";
    if (typeof node === "boolean") return "boolean";
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (obj.type === "Literal") {
        const value = obj.value;
        if (typeof value === "string") return "string";
        if (typeof value === "number") return "number";
        if (typeof value === "boolean") return "boolean";
        if (value === null) return "null";
        return "any";
      }
      if (obj.type === "Identifier") {
        return this.symbolTable.getType(obj.name as string) ?? "any";
      }
      if (obj.type === "BinaryExpression") {
        const operator = obj.operator as string;
        if (operator === "+" || operator === "-" || operator === "*" || operator === "/") return "number";
        if (operator === "==" || operator === "!=" || operator === "===" || operator === "!==" || operator === "<" || operator === ">" || operator === "<=" || operator === ">=") return "boolean";
        return "any";
      }
      if (obj.type === "CallExpression") return "any";
      if (obj.type === "MemberExpression") return "any";
      if (obj.type === "ArrayExpression") return "array";
      if (obj.type === "ObjectExpression") return "object";
      if (obj.type === "ArrowFunctionExpression" || obj.type === "FunctionExpression") return "function";
    }
    return "any";
  }

  getErrors(): Array<{ message: string; line?: number; column?: number }> {
    return [...this.errors];
  }

  getWarnings(): Array<{ message: string; line?: number; column?: number }> {
    return [...this.warnings];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  getWarningCount(): number {
    return this.warnings.length;
  }

  getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }

  clear(): void {
    this.errors = [];
    this.warnings = [];
    this.symbolTable.clear();
  }
}

export function createTypeChecker(symbolTable?: SymbolTable): TypeChecker {
  return new TypeChecker(symbolTable);
}
