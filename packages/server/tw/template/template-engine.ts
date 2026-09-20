/**
 * Template engine -- compiled template rendering with variables, partials, helpers.
 * @module server/template
 */

export interface TemplateOptions {
  delimiters?: { open: string; close: string };
  escape?: boolean;
  cache?: boolean;
  strict?: boolean;
  globals?: Record<string, unknown>;
  helpers?: Record<string, (...args: unknown[]) => unknown>;
  partials?: Record<string, string>;
  debug?: boolean;
}

export interface CompileResult {
  render: (data: Record<string, unknown>) => string;
  source: string;
  ast: TemplateNode[];
  errors: TemplateError[];
}

export interface TemplateError {
  message: string;
  line?: number;
  column?: number;
  position?: number;
}

export type TemplateNode =
  | { type: "text"; content: string }
  | { type: "variable"; name: string; escaped: boolean; filters: string[] }
  | { type: "block"; name: string; params: string[]; children: TemplateNode[]; inverse?: TemplateNode[] }
  | { type: "partial"; name: string; context?: string }
  | { type: "comment"; content: string }
  | { type: "helper"; name: string; args: string[]; hash: Record<string, string> };

const DEFAULT_OPTIONS: Required<TemplateOptions> = {
  delimiters: { open: "{{", close: "}}" },
  escape: true,
  cache: true,
  strict: false,
  globals: {},
  helpers: {},
  partials: {},
  debug: false,
};

export class TemplateEngine {
  private options: Required<TemplateOptions>;
  private cache: Map<string, (data: Record<string, unknown>) => string> = new Map();
  private compiledPartials: Map<string, (data: Record<string, unknown>) => string> = new Map();
  private stats = { totalCompilations: 0, totalRenders: 0, cacheHits: 0, cacheMisses: 0, totalErrors: 0 };

  constructor(options: TemplateOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.registerDefaultHelpers();
  }

  private registerDefaultHelpers(): void {
    this.options.helpers.upper = (value: unknown) => String(value).toUpperCase();
    this.options.helpers.lower = (value: unknown) => String(value).toLowerCase();
    this.options.helpers.capitalize = (value: unknown) => {
      const s = String(value);
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    };
    this.options.helpers.trim = (value: unknown) => String(value).trim();
    this.options.helpers.repeat = (value: unknown, count: number) => String(value).repeat(count);
    this.options.helpers.truncate = (value: unknown, length: number, suffix: string = "...") => {
      const s = String(value);
      return s.length > length ? s.slice(0, length) + suffix : s;
    };
    this.options.helpers.default = (value: unknown, defaultValue: unknown) => (value === null || value === undefined || value === "") ? defaultValue : value;
    this.options.helpers.join = (array: unknown[], separator: string = ", ") => Array.isArray(array) ? array.join(separator) : String(array);
    this.options.helpers.split = (value: unknown, separator: string = ",") => String(value).split(separator);
    this.options.helpers.length = (value: unknown) => {
      if (typeof value === "string" || Array.isArray(value)) return value.length;
      if (typeof value === "object" && value !== null) return Object.keys(value).length;
      return 0;
    };
    this.options.helpers.reverse = (value: unknown) => {
      if (typeof value === "string") return value.split("").reverse().join("");
      if (Array.isArray(value)) return [...value].reverse();
      return value;
    };
    this.options.helpers.sort = (value: unknown) => Array.isArray(value) ? [...value].sort() : value;
    this.options.helpers.first = (value: unknown) => Array.isArray(value) ? value[0] : value;
    this.options.helpers.last = (value: unknown) => Array.isArray(value) ? value[value.length - 1] : value;
    this.options.helpers.json = (value: unknown, indent: number = 2) => JSON.stringify(value, null, indent);
    this.options.helpers.abs = (value: unknown) => Math.abs(Number(value));
    this.options.helpers.round = (value: unknown, decimals: number = 0) => {
      const factor = Math.pow(10, decimals);
      return Math.round(Number(value) * factor) / factor;
    };
    this.options.helpers.floor = (value: unknown) => Math.floor(Number(value));
    this.options.helpers.ceil = (value: unknown) => Math.ceil(Number(value));
    this.options.helpers.date = (value: unknown, format: string = "short") => {
      const d = new Date(value as string);
      if (format === "short") return d.toLocaleDateString();
      if (format === "long") return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      if (format === "iso") return d.toISOString();
      if (format === "time") return d.toLocaleTimeString();
      return d.toLocaleDateString();
    };
    this.options.helpers.eq = (a: unknown, b: unknown) => a === b;
    this.options.helpers.ne = (a: unknown, b: unknown) => a !== b;
    this.options.helpers.gt = (a: unknown, b: unknown) => Number(a) > Number(b);
    this.options.helpers.lt = (a: unknown, b: unknown) => Number(a) < Number(b);
    this.options.helpers.gte = (a: unknown, b: unknown) => Number(a) >= Number(b);
    this.options.helpers.lte = (a: unknown, b: unknown) => Number(a) <= Number(b);
    this.options.helpers.and = (...args: unknown[]) => args.every(Boolean);
    this.options.helpers.or = (...args: unknown[]) => args.some(Boolean);
    this.options.helpers.not = (value: unknown) => !value;
    this.options.helpers.add = (a: unknown, b: unknown) => Number(a) + Number(b);
    this.options.helpers.subtract = (a: unknown, b: unknown) => Number(a) - Number(b);
    this.options.helpers.multiply = (a: unknown, b: unknown) => Number(a) * Number(b);
    this.options.helpers.divide = (a: unknown, b: unknown) => Number(b) === 0 ? 0 : Number(a) / Number(b);
    this.options.helpers.modulo = (a: unknown, b: unknown) => Number(b) === 0 ? 0 : Number(a) % Number(b);
    this.options.helpers.encode = (value: unknown) => encodeURIComponent(String(value));
    this.options.helpers.decode = (value: unknown) => decodeURIComponent(String(value));
    this.options.helpers.encodeURL = (value: unknown) => encodeURI(String(value));
    this.options.helpers.decodeURL = (value: unknown) => decodeURI(String(value));
    this.options.helpers.replace = (value: unknown, search: string, replacement: string) => String(value).split(search).join(replacement);
    this.options.helpers.padStart = (value: unknown, length: number, char: string = " ") => String(value).padStart(length, char);
    this.options.helpers.padEnd = (value: unknown, length: number, char: string = " ") => String(value).padEnd(length, char);
    this.options.helpers.slice = (value: unknown, start: number, end?: number) => {
      if (typeof value === "string") return value.slice(start, end);
      if (Array.isArray(value)) return value.slice(start, end);
      return value;
    };
    this.options.helpers.contains = (value: unknown, search: unknown) => {
      if (typeof value === "string") return value.includes(String(search));
      if (Array.isArray(value)) return value.includes(search);
      if (typeof value === "object" && value !== null) return (search as any) in value;
      return false;
    };
    this.options.helpers.startsWith = (value: unknown, search: string) => String(value).startsWith(search);
    this.options.helpers.endsWith = (value: unknown, search: string) => String(value).endsWith(search);
    this.options.helpers.matches = (value: unknown, pattern: string) => new RegExp(pattern).test(String(value));
    this.options.helpers.typeOf = (value: unknown) => typeof value;
    this.options.helpers.isArray = (value: unknown) => Array.isArray(value);
    this.options.helpers.isString = (value: unknown) => typeof value === "string";
    this.options.helpers.isNumber = (value: unknown) => typeof value === "number";
    this.options.helpers.isBoolean = (value: unknown) => typeof value === "boolean";
    this.options.helpers.isObject = (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value);
    this.options.helpers.isNull = (value: unknown) => value === null;
    this.options.helpers.isUndefined = (value: unknown) => value === undefined;
    this.options.helpers.isEmpty = (value: unknown) => {
      if (value === null || value === undefined || value === "") return true;
      if (Array.isArray(value) || typeof value === "string") return value.length === 0;
      if (typeof value === "object") return Object.keys(value).length === 0;
      return false;
    };
  }

  registerHelper(name: string, helper: (...args: unknown[]) => unknown): this {
    this.options.helpers[name] = helper;
    return this;
  }

  unregisterHelper(name: string): this {
    delete this.options.helpers[name];
    return this;
  }

  hasHelper(name: string): boolean {
    return name in this.options.helpers;
  }

  getHelper(name: string): ((...args: unknown[]) => unknown) | undefined {
    return this.options.helpers[name];
  }

  getHelpers(): string[] {
    return Object.keys(this.options.helpers);
  }

  registerPartial(name: string, template: string): this {
    this.options.partials[name] = template;
    const compiled = this.compile(template);
    this.compiledPartials.set(name, compiled.render);
    return this;
  }

  unregisterPartial(name: string): this {
    delete this.options.partials[name];
    this.compiledPartials.delete(name);
    return this;
  }

  hasPartial(name: string): boolean {
    return name in this.options.partials;
  }

  getPartial(name: string): string | undefined {
    return this.options.partials[name];
  }

  getPartials(): string[] {
    return Object.keys(this.options.partials);
  }

  registerGlobal(name: string, value: unknown): this {
    this.options.globals[name] = value;
    return this;
  }

  unregisterGlobal(name: string): this {
    delete this.options.globals[name];
    return this;
  }

  hasGlobal(name: string): boolean {
    return name in this.options.globals;
  }

  getGlobal(name: string): unknown {
    return this.options.globals[name];
  }

  getGlobals(): Record<string, unknown> {
    return { ...this.options.globals };
  }

  compile(source: string, name?: string): CompileResult {
    this.stats.totalCompilations++;
    const errors: TemplateError[] = [];
    const ast = this.parse(source, errors);
    const render = this.compileAST(ast, errors);
    if (name && this.options.cache) {
      this.cache.set(name, render);
    }
    return { render, source, ast, errors };
  }

  compileAST(ast: TemplateNode[], errors: TemplateError[]): (data: Record<string, unknown>) => string {
    return (data: Record<string, unknown>): string => {
      this.stats.totalRenders++;
      const fullData = { ...this.options.globals, ...data };
      return this.renderNodes(ast, fullData);
    };
  }

  render(source: string, data: Record<string, unknown> = {}): string {
    if (this.options.cache && this.cache.has(source)) {
      this.stats.cacheHits++;
      return this.cache.get(source)!(data);
    }
    this.stats.cacheMisses++;
    const { render, errors } = this.compile(source);
    if (errors.length > 0 && this.options.strict) {
      throw new Error(`Template compilation errors: ${errors.map((e) => e.message).join("; ")}`);
    }
    return render(data);
  }

  renderFile(path: string, data: Record<string, unknown> = {}): string {
    const template = this.options.partials[path];
    if (template) return this.render(template, data);
    return "";
  }

  renderPartial(name: string, data: Record<string, unknown> = {}): string {
    const render = this.compiledPartials.get(name);
    if (render) return render(data);
    const template = this.options.partials[name];
    if (template) return this.render(template, data);
    return "";
  }

  renderString(source: string, data: Record<string, unknown> = {}): string {
    return this.render(source, data);
  }

  private parse(source: string, errors: TemplateError[]): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    const { open, close } = this.options.delimiters;
    let pos = 0;
    let textStart = 0;
    let line = 1;
    let column = 1;
    while (pos < source.length) {
      const openIndex = source.indexOf(open, pos);
      if (openIndex === -1) {
        const text = source.slice(textStart);
        if (text) {
          nodes.push({ type: "text", content: text });
          line += text.split("\n").length - 1;
        }
        break;
      }
      const text = source.slice(textStart, openIndex);
      if (text) {
        nodes.push({ type: "text", content: text });
        line += text.split("\n").length - 1;
      }
      const closeIndex = source.indexOf(close, openIndex + open.length);
      if (closeIndex === -1) {
        errors.push({ message: `Unclosed template tag at position ${openIndex}`, line, column: openIndex - textStart + 1, position: openIndex });
        break;
      }
      const tagContent = source.slice(openIndex + open.length, closeIndex).trim();
      const node = this.parseTag(tagContent, errors);
      if (node) {
        nodes.push(node);
      }
      pos = closeIndex + close.length;
      textStart = pos;
      line += source.slice(openIndex, closeIndex + close.length).split("\n").length - 1;
    }
    return nodes;
  }

  private parseTag(tagContent: string, errors: TemplateError[]): TemplateNode | null {
    if (tagContent.startsWith("!")) {
      return { type: "comment", content: tagContent.slice(1).trim() };
    }
    if (tagContent.startsWith("#")) {
      const parts = tagContent.slice(1).trim().split(/\s+/);
      const name = parts[0];
      const params = parts.slice(1);
      return { type: "block", name, params, children: [], inverse: [] };
    }
    if (tagContent.startsWith("/")) {
      return null;
    }
    if (tagContent.startsWith(">")) {
      const parts = tagContent.slice(1).trim().split(/\s+/);
      return { type: "partial", name: parts[0], context: parts[1] };
    }
    if (tagContent.startsWith("&")) {
      return { type: "variable", name: tagContent.slice(1).trim(), escaped: false, filters: [] };
    }
    const pipeIndex = tagContent.indexOf("|");
    if (pipeIndex !== -1) {
      const name = tagContent.slice(0, pipeIndex).trim();
      const filters = tagContent.slice(pipeIndex + 1).split("|").map((f) => f.trim()).filter(Boolean);
      return { type: "variable", name, escaped: this.options.escape, filters };
    }
    return { type: "variable", name: tagContent.trim(), escaped: this.options.escape, filters: [] };
  }

  private renderNodes(nodes: TemplateNode[], data: Record<string, unknown>): string {
    let result = "";
    for (const node of nodes) {
      result += this.renderNode(node, data);
    }
    return result;
  }

  private renderNode(node: TemplateNode, data: Record<string, unknown>): string {
    switch (node.type) {
      case "text": return node.content;
      case "variable": return this.renderVariable(node, data);
      case "block": return this.renderBlock(node, data);
      case "partial": return this.renderPartialNode(node, data);
      case "comment": return "";
      case "helper": return this.renderHelper(node, data);
      default: return "";
    }
  }

  private renderVariable(node: { type: "variable"; name: string; escaped: boolean; filters: string[] }, data: Record<string, unknown>): string {
    let value = this.resolvePath(node.name, data);
    for (const filter of node.filters) {
      const helper = this.options.helpers[filter];
      if (helper) {
        value = helper(value);
      }
    }
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (node.escaped) return this.escape(str);
    return str;
  }

  private renderBlock(node: { type: "block"; name: string; params: string[]; children: TemplateNode[]; inverse?: TemplateNode[] }, data: Record<string, unknown>): string {
    const value = this.resolvePath(node.params[0] ?? "", data);
    switch (node.name) {
      case "if": return value ? this.renderNodes(node.children, data) : this.renderNodes(node.inverse ?? [], data);
      case "unless": return !value ? this.renderNodes(node.children, data) : this.renderNodes(node.inverse ?? [], data);
      case "each":
        if (Array.isArray(value)) {
          return value.map((item, index) => this.renderNodes(node.children, { ...data, this: item, index, first: index === 0, last: index === value.length - 1 })).join("");
        }
        return this.renderNodes(node.inverse ?? [], data);
      case "with":
        if (value && typeof value === "object") {
          return this.renderNodes(node.children, { ...data, ...value as Record<string, unknown> });
        }
        return "";
      case "eachelse":
        return this.renderNodes(node.children, data);
      default: return "";
    }
  }

  private renderPartialNode(node: { type: "partial"; name: string; context?: string }, data: Record<string, unknown>): string {
    const contextData = node.context ? this.resolvePath(node.context, data) : data;
    if (typeof contextData === "object" && contextData !== null) {
      return this.renderPartial(node.name, contextData as Record<string, unknown>);
    }
    return this.renderPartial(node.name, data);
  }

  private renderHelper(node: { type: "helper"; name: string; args: string[]; hash: Record<string, string> }, data: Record<string, unknown>): string {
    const helper = this.options.helpers[node.name];
    if (!helper) return "";
    const args = node.args.map((arg) => this.resolvePath(arg, data));
    return String(helper(...args) ?? "");
  }

  private resolvePath(path: string, data: Record<string, unknown>): unknown {
    if (!path) return undefined;
    if (path === "this") return data;
    if (path === ".") return data;
    const parts = path.split(".");
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private escape(html: string): string {
    const escapeMap: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#x27;",
      "/": "&#x2F;",
    };
    return html.replace(/[&<>"'/]/g, (c) => escapeMap[c] ?? c);
  }

  clearCache(): this {
    this.cache.clear();
    this.compiledPartials.clear();
    return this;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getStats(): { totalCompilations: number; totalRenders: number; cacheHits: number; cacheMisses: number; totalErrors: number; cacheHitRate: number } {
    return {
      ...this.stats,
      cacheHitRate: this.stats.totalRenders > 0 ? (this.stats.cacheHits / this.stats.totalRenders) * 100 : 0,
    };
  }

  resetStats(): void {
    this.stats = { totalCompilations: 0, totalRenders: 0, cacheHits: 0, cacheMisses: 0, totalErrors: 0 };
  }

  setOptions(options: Partial<TemplateOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  getOptions(): Required<TemplateOptions> {
    return { ...this.options };
  }

  setDelimiters(open: string, close: string): this {
    this.options.delimiters = { open, close };
    return this;
  }

  getDelimiters(): { open: string; close: string } {
    return { ...this.options.delimiters };
  }

  setEscape(escape: boolean): this {
    this.options.escape = escape;
    return this;
  }

  isEscape(): boolean {
    return this.options.escape;
  }

  setCache(cache: boolean): this {
    this.options.cache = cache;
    if (!cache) this.clearCache();
    return this;
  }

  isCache(): boolean {
    return this.options.cache;
  }

  setStrict(strict: boolean): this {
    this.options.strict = strict;
    return this;
  }

  isStrict(): boolean {
    return this.options.strict;
  }

  setDebug(debug: boolean): this {
    this.options.debug = debug;
    return this;
  }

  isDebug(): boolean {
    return this.options.debug;
  }

  precompile(source: string): string {
    const { render } = this.compile(source);
    return render.toString();
  }

  precompilePartials(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, render] of this.compiledPartials) {
      result[name] = render.toString();
    }
    return result;
  }

  toJSON(): string {
    return JSON.stringify({
      helpers: this.getHelpers().length,
      partials: this.getPartials().length,
      globals: Object.keys(this.options.globals).length,
      cacheSize: this.cache.size,
      stats: this.getStats(),
    }, null, 2);
  }
}

export function createTemplateEngine(options?: TemplateOptions): TemplateEngine {
  return new TemplateEngine(options);
}

export class ViewEngine {
  private templateEngine: TemplateEngine;
  private views: Map<string, string> = new Map();
  private layouts: Map<string, string> = new Map();
  private defaultLayout: string | null = null;
  private fileExtension: string = ".html";

  constructor(templateEngine?: TemplateEngine) {
    this.templateEngine = templateEngine ?? new TemplateEngine();
  }

  setView(name: string, template: string): this {
    this.views.set(name, template);
    return this;
  }

  getView(name: string): string | undefined {
    return this.views.get(name);
  }

  hasView(name: string): boolean {
    return this.views.has(name);
  }

  removeView(name: string): this {
    this.views.delete(name);
    return this;
  }

  clearViews(): this {
    this.views.clear();
    return this;
  }

  setLayout(name: string, template: string): this {
    this.layouts.set(name, template);
    return this;
  }

  getLayout(name: string): string | undefined {
    return this.layouts.get(name);
  }

  hasLayout(name: string): boolean {
    return this.layouts.has(name);
  }

  removeLayout(name: string): this {
    this.layouts.delete(name);
    return this;
  }

  clearLayouts(): this {
    this.layouts.clear();
    return this;
  }

  setDefaultLayout(name: string | null): this {
    this.defaultLayout = name;
    return this;
  }

  getDefaultLayout(): string | null {
    return this.defaultLayout;
  }

  setFileExtension(ext: string): this {
    this.fileExtension = ext.startsWith(".") ? ext : "." + ext;
    return this;
  }

  getFileExtension(): string {
    return this.fileExtension;
  }

  render(viewName: string, data: Record<string, unknown> = {}, layoutName?: string): string {
    const view = this.views.get(viewName);
    if (!view) {
      throw new Error(`View "${viewName}" not found`);
    }
    let content = this.templateEngine.render(view, data);
    const layout = layoutName ?? this.defaultLayout;
    if (layout) {
      const layoutTemplate = this.layouts.get(layout);
      if (layoutTemplate) {
        content = this.templateEngine.render(layoutTemplate, { ...data, body: content, content });
      }
    }
    return content;
  }

  renderString(template: string, data: Record<string, unknown> = {}): string {
    return this.templateEngine.render(template, data);
  }

  renderPartial(name: string, data: Record<string, unknown> = {}): string {
    return this.templateEngine.renderPartial(name, data);
  }

  getTemplateEngine(): TemplateEngine {
    return this.templateEngine;
  }

  getViewCount(): number {
    return this.views.size;
  }

  getLayoutCount(): number {
    return this.layouts.size;
  }

  getViewNames(): string[] {
    return [...this.views.keys()];
  }

  getLayoutNames(): string[] {
    return [...this.layouts.keys()];
  }

  toJSON(): string {
    return JSON.stringify({
      views: this.views.size,
      layouts: this.layouts.size,
      defaultLayout: this.defaultLayout,
      fileExtension: this.fileExtension,
    }, null, 2);
  }
}

export function createViewEngine(templateEngine?: TemplateEngine): ViewEngine {
  return new ViewEngine(templateEngine);
}

export class SessionManager {
  private sessions: Map<string, { id: string; data: Record<string, unknown>; createdAt: number; expiresAt: number; lastAccessedAt: number; accessCount: number }> = new Map();
  private maxAge: number = 86400000;
  private sessionIdLength: number = 32;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isCleaningUp: boolean = false;

  constructor(maxAge: number = 86400000) {
    this.maxAge = maxAge;
    this.startCleanup();
  }

  create(data: Record<string, unknown> = {}): string {
    const id = this.generateSessionId();
    const now = Date.now();
    this.sessions.set(id, {
      id,
      data,
      createdAt: now,
      expiresAt: now + this.maxAge,
      lastAccessedAt: now,
      accessCount: 0,
    });
    return id;
  }

  get(id: string): Record<string, unknown> | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastAccessedAt = Date.now();
    session.accessCount++;
    return session.data;
  }

  set(id: string, key: string, value: unknown): boolean {
    const session = this.sessions.get(id);
    if (!session || this.isExpired(session)) return false;
    session.data[key] = value;
    session.lastAccessedAt = Date.now();
    session.accessCount++;
    return true;
  }

  delete(id: string, key: string): boolean {
    const session = this.sessions.get(id);
    if (!session || this.isExpired(session)) return false;
    delete session.data[key];
    return true;
  }

  has(id: string, key: string): boolean {
    const session = this.sessions.get(id);
    if (!session || this.isExpired(session)) return false;
    return key in session.data;
  }

  destroy(id: string): boolean {
    return this.sessions.delete(id);
  }

  destroyAll(): void {
    this.sessions.clear();
  }

  touch(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session || this.isExpired(session)) return false;
    session.lastAccessedAt = Date.now();
    session.expiresAt = Date.now() + this.maxAge;
    return true;
  }

  regenerate(id: string): string | null {
    const session = this.sessions.get(id);
    if (!session || this.isExpired(session)) return null;
    const newId = this.generateSessionId();
    this.sessions.set(newId, {
      ...session,
      id: newId,
      lastAccessedAt: Date.now(),
      expiresAt: Date.now() + this.maxAge,
    });
    this.sessions.delete(id);
    return newId;
  }

  exists(id: string): boolean {
    const session = this.sessions.get(id);
    return session !== undefined && !this.isExpired(session);
  }

  isExpired2(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return true;
    return this.isExpired(session);
  }

  getCreatedAt(id: string): number | undefined {
    return this.sessions.get(id)?.createdAt;
  }

  getExpiresAt(id: string): number | undefined {
    return this.sessions.get(id)?.expiresAt;
  }

  getLastAccessedAt(id: string): number | undefined {
    return this.sessions.get(id)?.lastAccessedAt;
  }

  getAccessCount(id: string): number | undefined {
    return this.sessions.get(id)?.accessCount;
  }

  extend(id: string, maxAge: number = this.maxAge): boolean {
    const session = this.sessions.get(id);
    if (!session || this.isExpired(session)) return false;
    session.expiresAt = Date.now() + maxAge;
    return true;
  }

  setMaxAge(maxAge: number): void {
    this.maxAge = maxAge;
  }

  getMaxAge(): number {
    return this.maxAge;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!this.isExpired(session)) count++;
    }
    return count;
  }

  getExpiredSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (this.isExpired(session)) count++;
    }
    return count;
  }

  getAllSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getActiveSessionIds(): string[] {
    return [...this.sessions.values()].filter((s) => !this.isExpired(s)).map((s) => s.id);
  }

  getExpiredSessionIds(): string[] {
    return [...this.sessions.values()].filter((s) => this.isExpired(s)).map((s) => s.id);
  }

  cleanup(): number {
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  startCleanup(interval: number = 60000): void {
    if (this.cleanupInterval) return;
    this.isCleaningUp = true;
    this.cleanupInterval = setInterval(() => this.cleanup(), interval);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isCleaningUp = false;
  }

  isCleaningUpCheck(): boolean {
    return this.isCleaningUp;
  }

  setSessionIdLength(length: number): void {
    this.sessionIdLength = length;
  }

  getSessionIdLength(): number {
    return this.sessionIdLength;
  }

  private generateSessionId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < this.sessionIdLength; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private isExpired(session: { expiresAt: number }): boolean {
    return Date.now() > session.expiresAt;
  }

  getStats(): { totalSessions: number; activeSessions: number; expiredSessions: number; avgAccessCount: number; avgAge: number } {
    const sessions = [...this.sessions.values()];
    const active = sessions.filter((s) => !this.isExpired(s));
    const avgAccessCount = active.length > 0 ? active.reduce((sum, s) => sum + s.accessCount, 0) / active.length : 0;
    const now = Date.now();
    const avgAge = active.length > 0 ? active.reduce((sum, s) => sum + (now - s.createdAt), 0) / active.length : 0;
    return {
      totalSessions: sessions.length,
      activeSessions: active.length,
      expiredSessions: sessions.length - active.length,
      avgAccessCount,
      avgAge,
    };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }

  dispose(): void {
    this.stopCleanup();
    this.destroyAll();
  }
}

export function createSessionManager(maxAge?: number): SessionManager {
  return new SessionManager(maxAge);
}

export class CacheLayer<T> {
  private cache: Map<string, { value: T; expiresAt: number; createdAt: number; accessCount: number; lastAccessedAt: number }> = new Map();
  private maxAge: number;
  private maxSize: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private stats = { hits: 0, misses: 0, sets: 0, deletes: 0, expired: 0, evictions: 0 };

  constructor(maxAge: number = 300000, maxSize: number = 1000) {
    this.maxAge = maxAge;
    this.maxSize = maxSize;
  }

  set(key: string, value: T, ttl: number = this.maxAge): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttl, createdAt: Date.now(), accessCount: 0, lastAccessedAt: Date.now() });
    this.stats.sets++;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      return undefined;
    }
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expired++;
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    let result = this.cache.delete(key);
    if (result) this.stats.deletes++;
    return result;
  }

  clear(): void {
    this.cache.clear();
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }

  values(): T[] {
    return [...this.cache.values()].map((e) => e.value);
  }

  entries(): Array<{ key: string; value: T; createdAt: number; accessCount: number }> {
    return [...this.cache.entries()].map(([key, entry]) => ({ key, value: entry.value, createdAt: entry.createdAt, accessCount: entry.accessCount }));
  }

  size(): number {
    return this.cache.size;
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    while (this.cache.size > maxSize) {
      this.evictLRU();
    }
  }

  getMaxAge(): number {
    return this.maxAge;
  }

  setMaxAge(maxAge: number): void {
    this.maxAge = maxAge;
  }

  getTTL(key: string): number | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    return Math.max(0, entry.expiresAt - Date.now());
  }

  setTTL(key: string, ttl: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttl;
    return true;
  }

  expire(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    entry.expiresAt = 0;
    return true;
  }

  touch(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    entry.lastAccessedAt = Date.now();
    return true;
  }

  getAccessCount(key: string): number | undefined {
    return this.cache.get(key)?.accessCount;
  }

  getCreatedAt(key: string): number | undefined {
    return this.cache.get(key)?.createdAt;
  }

  getLastAccessedAt(key: string): number | undefined {
    return this.cache.get(key)?.lastAccessedAt;
  }

  mset(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl ?? this.maxAge);
    }
  }

  mget(keys: string[]): Array<T | undefined> {
    return keys.map((key) => this.get(key));
  }

  mdelete(keys: string[]): void {
    for (const key of keys) {
      this.delete(key);
    }
  }

  hasAll(keys: string[]): boolean {
    return keys.every((key) => this.has(key));
  }

  hasAny(keys: string[]): boolean {
    return keys.some((key) => this.has(key));
  }

  getOrSet(key: string, factory: () => T, ttl: number = this.maxAge): T {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const value = factory();
    this.set(key, value, ttl);
    return value;
  }

  getOrSetAsync(key: string, factory: () => Promise<T>, ttl: number = this.maxAge): Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) return Promise.resolve(existing);
    return factory().then((value) => {
      this.set(key, value, ttl);
      return value;
    });
  }

  remember(key: string, factory: () => T, ttl: number = this.maxAge): T {
    return this.getOrSet(key, factory, ttl);
  }

  rememberAsync(key: string, factory: () => Promise<T>, ttl: number = this.maxAge): Promise<T> {
    return this.getOrSetAsync(key, factory, ttl);
  }

  increment(key: string, by: number = 1): number {
    const current = this.get(key) as unknown as number;
    const newValue = (current ?? 0) + by;
    this.set(key, newValue as unknown as T);
    return newValue;
  }

  decrement(key: string, by: number = 1): number {
    return this.increment(key, -by);
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.expired++;
        cleaned++;
      }
    }
    return cleaned;
  }

  startCleanup(interval: number = 60000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), interval);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getStats(): { hits: number; misses: number; sets: number; deletes: number; expired: number; evictions: number; size: number; hitRate: number } {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, expired: 0, evictions: 0 };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }

  dispose(): void {
    this.stopCleanup();
    this.clear();
    this.resetStats();
  }
}

export function createCacheLayer<T>(maxAge?: number, maxSize?: number): CacheLayer<T> {
  return new CacheLayer(maxAge, maxSize);
}

export class StaticFileServer {
  private root: string;
  private cache: CacheLayer<Uint8Array>;
  private mimeTypes: Map<string, string> = new Map();
  private indexFiles: string[] = ["index.html", "index.htm"];
  private defaultHeaders: Record<string, string> = {};
  private maxAge: number = 86400;
  private enabled: boolean = true;
  private dotfiles: "allow" | "deny" | "ignore" = "ignore";
  private brotli: boolean = false;
  private gzip: boolean = false;
  private immutable: boolean = false;
  private redirect: boolean = true;
  private extensions: string[] = [];
  private lastModified: boolean = true;
  private etag: boolean = true;

  constructor(root: string, options?: { maxAge?: number; cache?: CacheLayer<Uint8Array>; indexFiles?: string[]; defaultHeaders?: Record<string, string>; dotfiles?: "allow" | "deny" | "ignore"; gzip?: boolean; brotli?: boolean; immutable?: boolean; redirect?: boolean; extensions?: string[]; lastModified?: boolean; etag?: boolean }) {
    this.root = root;
    this.maxAge = options?.maxAge ?? 86400;
    this.cache = options?.cache ?? new CacheLayer<Uint8Array>(300000);
    this.indexFiles = options?.indexFiles ?? ["index.html", "index.htm"];
    this.defaultHeaders = options?.defaultHeaders ?? {};
    this.dotfiles = options?.dotfiles ?? "ignore";
    this.brotli = options?.brotli ?? false;
    this.gzip = options?.gzip ?? false;
    this.immutable = options?.immutable ?? false;
    this.redirect = options?.redirect ?? true;
    this.extensions = options?.extensions ?? [];
    this.lastModified = options?.lastModified ?? true;
    this.etag = options?.etag ?? true;
    this.registerDefaultMimeTypes();
  }

  private registerDefaultMimeTypes(): void {
    this.mimeTypes.set(".html", "text/html; charset=utf-8");
    this.mimeTypes.set(".htm", "text/html; charset=utf-8");
    this.mimeTypes.set(".css", "text/css; charset=utf-8");
    this.mimeTypes.set(".js", "application/javascript; charset=utf-8");
    this.mimeTypes.set(".mjs", "application/javascript; charset=utf-8");
    this.mimeTypes.set(".json", "application/json; charset=utf-8");
    this.mimeTypes.set(".xml", "application/xml; charset=utf-8");
    this.mimeTypes.set(".txt", "text/plain; charset=utf-8");
    this.mimeTypes.set(".md", "text/markdown; charset=utf-8");
    this.mimeTypes.set(".csv", "text/csv; charset=utf-8");
    this.mimeTypes.set(".svg", "image/svg+xml");
    this.mimeTypes.set(".png", "image/png");
    this.mimeTypes.set(".jpg", "image/jpeg");
    this.mimeTypes.set(".jpeg", "image/jpeg");
    this.mimeTypes.set(".gif", "image/gif");
    this.mimeTypes.set(".bmp", "image/bmp");
    this.mimeTypes.set(".ico", "image/x-icon");
    this.mimeTypes.set(".webp", "image/webp");
    this.mimeTypes.set(".avif", "image/avif");
    this.mimeTypes.set(".mp4", "video/mp4");
    this.mimeTypes.set(".webm", "video/webm");
    this.mimeTypes.set(".ogg", "video/ogg");
    this.mimeTypes.set(".mp3", "audio/mpeg");
    this.mimeTypes.set(".wav", "audio/wav");
    this.mimeTypes.set(".flac", "audio/flac");
    this.mimeTypes.set(".aac", "audio/aac");
    this.mimeTypes.set(".m4a", "audio/mp4");
    this.mimeTypes.set(".oga", "audio/ogg");
    this.mimeTypes.set(".opus", "audio/opus");
    this.mimeTypes.set(".pdf", "application/pdf");
    this.mimeTypes.set(".zip", "application/zip");
    this.mimeTypes.set(".gz", "application/gzip");
    this.mimeTypes.set(".br", "application/brotli");
    this.mimeTypes.set(".tar", "application/x-tar");
    this.mimeTypes.set(".7z", "application/x-7z-compressed");
    this.mimeTypes.set(".rar", "application/x-rar-compressed");
    this.mimeTypes.set(".woff", "font/woff");
    this.mimeTypes.set(".woff2", "font/woff2");
    this.mimeTypes.set(".ttf", "font/ttf");
    this.mimeTypes.set(".otf", "font/otf");
    this.mimeTypes.set(".eot", "application/vnd.ms-fontobject");
    this.mimeTypes.set(".wasm", "application/wasm");
    this.mimeTypes.set(".manifest", "text/cache-manifest");
    this.mimeTypes.set(".appcache", "text/cache-manifest");
    this.mimeTypes.set(".webmanifest", "application/manifest+json");
    this.mimeTypes.set(".map", "application/json");
    this.mimeTypes.set(".webp", "image/webp");
    this.mimeTypes.set(".ts", "application/typescript");
    this.mimeTypes.set(".tsx", "application/typescript");
    this.mimeTypes.set(".jsx", "application/javascript");
    this.mimeTypes.set(".vue", "text/vue");
    this.mimeTypes.set(".svelte", "text/svelte");
    this.mimeTypes.set(".yaml", "text/yaml");
    this.mimeTypes.set(".yml", "text/yaml");
    this.mimeTypes.set(".toml", "text/toml");
    this.mimeTypes.set(".ini", "text/plain");
    this.mimeTypes.set(".conf", "text/plain");
    this.mimeTypes.set(".env", "text/plain");
    this.mimeTypes.set(".sql", "application/sql");
    this.mimeTypes.set(".sh", "application/x-sh");
    this.mimeTypes.set(".bat", "application/x-bat");
    this.mimeTypes.set(".ps1", "application/x-powershell");
    this.mimeTypes.set(".py", "text/x-python");
    this.mimeTypes.set(".rb", "text/x-ruby");
    this.mimeTypes.set(".php", "application/x-php");
    this.mimeTypes.set(".java", "text/x-java");
    this.mimeTypes.set(".kt", "text/x-kotlin");
    this.mimeTypes.set(".swift", "text/x-swift");
    this.mimeTypes.set(".go", "text/x-go");
    this.mimeTypes.set(".rs", "text/x-rust");
    this.mimeTypes.set(".c", "text/x-c");
    this.mimeTypes.set(".cpp", "text/x-c++");
    this.mimeTypes.set(".h", "text/x-c");
    this.mimeTypes.set(".hpp", "text/x-c++");
    this.mimeTypes.set(".cs", "text/x-csharp");
    this.mimeTypes.set(".fs", "text/x-fsharp");
    this.mimeTypes.set(".vb", "text/x-visualbasic");
    this.mimeTypes.set(".dart", "application/dart");
    this.mimeTypes.set(".lua", "text/x-lua");
    this.mimeTypes.set(".r", "text/x-r");
    this.mimeTypes.set(".scala", "text/x-scala");
    this.mimeTypes.set(".clj", "text/x-clojure");
    this.mimeTypes.set(".ex", "text/x-elixir");
    this.mimeTypes.set(".exs", "text/x-elixir");
    this.mimeTypes.set(".erl", "text/x-erlang");
    this.mimeTypes.set(".hs", "text/x-haskell");
    this.mimeTypes.set(".ml", "text/x-ocaml");
    this.mimeTypes.set(".elm", "text/x-elm");
    this.mimeTypes.set(".sql", "application/sql");
    this.mimeTypes.set(".graphql", "application/graphql");
    this.mimeTypes.set(".proto", "text/x-protobuf");
    this.mimeTypes.set(".thrift", "text/x-thrift");
    this.mimeTypes.set(".avro", "text/x-avro");
    this.mimeTypes.set(".wsdl", "application/wsdl+xml");
    this.mimeTypes.set(".xsd", "application/xml");
    this.mimeTypes.set(".xslt", "application/xslt+xml");
    this.mimeTypes.set(".xhtml", "application/xhtml+xml");
    this.mimeTypes.set(".dtd", "application/xml-dtd");
    this.mimeTypes.set(".rss", "application/rss+xml");
    this.mimeTypes.set(".atom", "application/atom+xml");
    this.mimeTypes.set(".rdf", "application/rdf+xml");
    this.mimeTypes.set(".owl", "application/rdf+xml");
    this.mimeTypes.set(".ttl", "text/turtle");
    this.mimeTypes.set(".n3", "text/n3");
    this.mimeTypes.set(".nt", "application/n-triples");
    this.mimeTypes.set(".jsonld", "application/ld+json");
    this.mimeTypes.set(".cbor", "application/cbor");
    this.mimeTypes.set(".msgpack", "application/msgpack");
    this.mimeTypes.set(".protobuf", "application/x-protobuf");
    this.mimeTypes.set(".flatbuffers", "application/x-flatbuffers");
    this.mimeTypes.set(".capnp", "application/x-capnp");
    this.mimeTypes.set(".avsc", "application/vnd.apache.avro+json");
    this.mimeTypes.set(".dvc", "text/plain");
    this.mimeTypes.set(".ipynb", "application/x-ipynb+json");
    this.mimeTypes.set(".rmd", "text/x-rmarkdown");
    this.mimeTypes.set(".qmd", "text/x-quarto");
    this.mimeTypes.set(".org", "text/x-org");
    this.mimeTypes.set(".tex", "application/x-tex");
    this.mimeTypes.set(".bib", "text/x-bibtex");
    this.mimeTypes.set(".bst", "text/x-bibtex-style");
    this.mimeTypes.set(".sty", "text/x-tex-style");
    this.mimeTypes.set(".cls", "text/x-tex-class");
    this.mimeTypes.set(".clojure", "text/x-clojure");
    this.mimeTypes.set(".dockerfile", "text/x-dockerfile");
    this.mimeTypes.set(".gitignore", "text/plain");
    this.mimeTypes.set(".gitattributes", "text/plain");
    this.mimeTypes.set(".editorconfig", "text/plain");
    this.mimeTypes.set(".eslintrc", "application/json");
    this.mimeTypes.set(".prettierrc", "application/json");
    this.mimeTypes.set(".babelrc", "application/json");
    this.mimeTypes.set(".stylelintrc", "application/json");
    this.mimeTypes.set(".tsconfig", "application/json");
    this.mimeTypes.set(".jsconfig", "application/json");
    this.mimeTypes.set(".babel.config", "application/javascript");
    this.mimeTypes.set(".jest.config", "application/javascript");
    this.mimeTypes.set(".webpack.config", "application/javascript");
    this.mimeTypes.set(".rollup.config", "application/javascript");
    this.mimeTypes.set(".vite.config", "application/javascript");
    this.mimeTypes.set(".eslintrc.js", "application/javascript");
    this.mimeTypes.set(".prettierrc.js", "application/javascript");
    this.mimeTypes.set(".stylelintrc.js", "application/javascript");
    this.mimeTypes.set(".postcssrc", "application/json");
    this.mimeTypes.set(".tailwind", "text/plain");
    this.mimeTypes.set(".parcelrc", "application/json");
    this.mimeTypes.set(".npmrc", "text/plain");
    this.mimeTypes.set(".yarnrc", "text/plain");
    this.mimeTypes.set(".nvmrc", "text/plain");
    this.mimeTypes.set(".node-version", "text/plain");
    this.mimeTypes.set(".ruby-version", "text/plain");
    this.mimeTypes.set(".python-version", "text/plain");
    this.mimeTypes.set(".tool-versions", "text/plain");
  }

  getMimeType(path: string): string {
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    return this.mimeTypes.get(ext) ?? "application/octet-stream";
  }

  registerMimeType(ext: string, mimeType: string): this {
    this.mimeTypes.set(ext.startsWith(".") ? ext : "." + ext, mimeType);
    return this;
  }

  unregisterMimeType(ext: string): this {
    this.mimeTypes.delete(ext.startsWith(".") ? ext : "." + ext);
    return this;
  }

  hasMimeType(ext: string): boolean {
    return this.mimeTypes.has(ext.startsWith(".") ? ext : "." + ext);
  }

  getMimeTypes(): Record<string, string> {
    return Object.fromEntries(this.mimeTypes);
  }

  getRoot(): string {
    return this.root;
  }

  setRoot(root: string): this {
    this.root = root;
    return this;
  }

  getMaxAge(): number {
    return this.maxAge;
  }

  setMaxAge(maxAge: number): this {
    this.maxAge = maxAge;
    return this;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    return this;
  }

  enable(): this {
    this.enabled = true;
    return this;
  }

  disable(): this {
    this.enabled = false;
    return this;
  }

  getDotfiles(): string {
    return this.dotfiles;
  }

  setDotfiles(dotfiles: "allow" | "deny" | "ignore"): this {
    this.dotfiles = dotfiles;
    return this;
  }

  isGzip(): boolean {
    return this.gzip;
  }

  setGzip(gzip: boolean): this {
    this.gzip = gzip;
    return this;
  }

  isBrotli(): boolean {
    return this.brotli;
  }

  setBrotli(brotli: boolean): this {
    this.brotli = brotli;
    return this;
  }

  isImmutable(): boolean {
    return this.immutable;
  }

  setImmutable(immutable: boolean): this {
    this.immutable = immutable;
    return this;
  }

  isRedirect(): boolean {
    return this.redirect;
  }

  setRedirect(redirect: boolean): this {
    this.redirect = redirect;
    return this;
  }

  isLastModified(): boolean {
    return this.lastModified;
  }

  setLastModified(lastModified: boolean): this {
    this.lastModified = lastModified;
    return this;
  }

  isETag(): boolean {
    return this.etag;
  }

  setETag(etag: boolean): this {
    this.etag = etag;
    return this;
  }

  getIndexFiles(): string[] {
    return [...this.indexFiles];
  }

  setIndexFiles(files: string[]): this {
    this.indexFiles = files;
    return this;
  }

  addIndexFile(file: string): this {
    if (!this.indexFiles.includes(file)) {
      this.indexFiles.push(file);
    }
    return this;
  }

  removeIndexFile(file: string): this {
    this.indexFiles = this.indexFiles.filter((f) => f !== file);
    return this;
  }

  getDefaultHeaders(): Record<string, string> {
    return { ...this.defaultHeaders };
  }

  setDefaultHeaders(headers: Record<string, string>): this {
    this.defaultHeaders = headers;
    return this;
  }

  addDefaultHeader(name: string, value: string): this {
    this.defaultHeaders[name] = value;
    return this;
  }

  removeDefaultHeader(name: string): this {
    delete this.defaultHeaders[name];
    return this;
  }

  getExtensions(): string[] {
    return [...this.extensions];
  }

  setExtensions(extensions: string[]): this {
    this.extensions = extensions;
    return this;
  }

  addExtension(ext: string): this {
    if (!this.extensions.includes(ext)) {
      this.extensions.push(ext);
    }
    return this;
  }

  removeExtension(ext: string): this {
    this.extensions = this.extensions.filter((e) => e !== ext);
    return this;
  }

  getCache(): CacheLayer<Uint8Array> {
    return this.cache;
  }

  clearCache(): this {
    this.cache.clear();
    return this;
  }

  getCacheStats(): ReturnType<CacheLayer<Uint8Array>["getStats"]> {
    return this.cache.getStats();
  }

  isDotfile(path: string): boolean {
    const parts = path.split("/");
    return parts.some((part) => part.startsWith(".") && part !== "." && part !== "..");
  }

  shouldServe(path: string): boolean {
    if (!this.enabled) return false;
    if (this.isDotfile(path)) {
      return this.dotfiles === "allow";
    }
    return true;
  }

  resolvePath(path: string): string {
    let resolved = path;
    if (!resolved.startsWith("/")) {
      resolved = "/" + resolved;
    }
    if (this.extensions.length > 0) {
      const hasExtension = this.extensions.some((ext) => resolved.endsWith(ext));
      if (!hasExtension) {
        resolved += this.extensions[0];
      }
    }
    return resolved;
  }

  createETag(content: Uint8Array): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content[i];
      hash = hash & hash;
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }

  createLastModified(timestamp: number): string {
    return new Date(timestamp).toUTCString();
  }

  createCacheControl(): string {
    if (this.immutable) {
      return `public, max-age=${this.maxAge}, immutable`;
    }
    return `public, max-age=${this.maxAge}`;
  }

  createHeaders(path: string, content: Uint8Array, lastModified?: number): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": this.getMimeType(path),
      "Content-Length": String(content.length),
      "Cache-Control": this.createCacheControl(),
      ...this.defaultHeaders,
    };
    if (this.lastModified && lastModified) {
      headers["Last-Modified"] = this.createLastModified(lastModified);
    }
    if (this.etag) {
      headers["ETag"] = this.createETag(content);
    }
    return headers;
  }

  toJSON(): string {
    return JSON.stringify({
      root: this.root,
      maxAge: this.maxAge,
      enabled: this.enabled,
      dotfiles: this.dotfiles,
      gzip: this.gzip,
      brotli: this.brotli,
      immutable: this.immutable,
      redirect: this.redirect,
      lastModified: this.lastModified,
      etag: this.etag,
      indexFiles: this.indexFiles,
      extensions: this.extensions,
      mimeTypes: this.mimeTypes.size,
      cache: this.cache.getStats(),
    }, null, 2);
  }
}

export function createStaticFileServer(root: string, options?: ConstructorParameters<typeof StaticFileServer>[1]): StaticFileServer {
  return new StaticFileServer(root, options);
}
