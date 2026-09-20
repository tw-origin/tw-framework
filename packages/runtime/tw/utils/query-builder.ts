/**
 * Query builder -- fluent query construction for data stores.
 * @module runtime/utils
 */

export type QueryOperator = "=" | "!=" | ">" | ">=" | "<" | "<=" | "like" | "in" | "not in" | "between" | "is null" | "is not null" | "contains" | "starts with" | "ends with";

export interface QueryCondition {
  field: string;
  operator: QueryOperator;
  value?: unknown;
  values?: unknown[];
  start?: unknown;
  end?: unknown;
  connector?: "and" | "or";
}

export interface QueryOrder {
  field: string;
  direction: "asc" | "desc";
}

export interface QueryJoin {
  type: "inner" | "left" | "right" | "full";
  table: string;
  on: string;
  alias?: string;
}

export interface QueryOptions {
  table?: string;
  fields?: string[];
  conditions?: QueryCondition[];
  orders?: QueryOrder[];
  joins?: QueryJoin[];
  groupBy?: string[];
  having?: QueryCondition[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
}

export class QueryBuilder {
  private table: string = "";
  private fields: string[] = [];
  private conditions: QueryCondition[] = [];
  private orders: QueryOrder[] = [];
  private joins: QueryJoin[] = [];
  private groupByFields: string[] = [];
  private havingConditions: QueryCondition[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private isDistinct: boolean = false;
  private params: unknown[] = [];

  from(table: string): this {
    this.table = table;
    return this;
  }

  select(...fields: string[]): this {
    this.fields.push(...fields);
    return this;
  }

  distinct(): this {
    this.isDistinct = true;
    return this;
  }

  where(field: string, operator: QueryOperator, value?: unknown): this {
    this.conditions.push({ field, operator, value, connector: "and" });
    if (value !== undefined) this.params.push(value);
    return this;
  }

  andWhere(field: string, operator: QueryOperator, value?: unknown): this {
    return this.where(field, operator, value);
  }

  orWhere(field: string, operator: QueryOperator, value?: unknown): this {
    this.conditions.push({ field, operator, value, connector: "or" });
    if (value !== undefined) this.params.push(value);
    return this;
  }

  whereIn(field: string, values: unknown[]): this {
    this.conditions.push({ field, operator: "in", values, connector: "and" });
    this.params.push(...values);
    return this;
  }

  whereNotIn(field: string, values: unknown[]): this {
    this.conditions.push({ field, operator: "not in", values, connector: "and" });
    this.params.push(...values);
    return this;
  }

  whereBetween(field: string, start: unknown, end: unknown): this {
    this.conditions.push({ field, operator: "between", start, end, connector: "and" });
    this.params.push(start, end);
    return this;
  }

  whereNull(field: string): this {
    this.conditions.push({ field, operator: "is null", connector: "and" });
    return this;
  }

  whereNotNull(field: string): this {
    this.conditions.push({ field, operator: "is not null", connector: "and" });
    return this;
  }

  whereLike(field: string, pattern: string): this {
    this.conditions.push({ field, operator: "like", value: pattern, connector: "and" });
    this.params.push(pattern);
    return this;
  }

  whereContains(field: string, value: string): this {
    this.conditions.push({ field, operator: "contains", value, connector: "and" });
    this.params.push(value);
    return this;
  }

  whereStartsWith(field: string, value: string): this {
    this.conditions.push({ field, operator: "starts with", value, connector: "and" });
    this.params.push(value);
    return this;
  }

  whereEndsWith(field: string, value: string): this {
    this.conditions.push({ field, operator: "ends with", value, connector: "and" });
    this.params.push(value);
    return this;
  }

  orWhereIn(field: string, values: unknown[]): this {
    this.conditions.push({ field, operator: "in", values, connector: "or" });
    this.params.push(...values);
    return this;
  }

  orWhereNotIn(field: string, values: unknown[]): this {
    this.conditions.push({ field, operator: "not in", values, connector: "or" });
    this.params.push(...values);
    return this;
  }

  orWhereNull(field: string): this {
    this.conditions.push({ field, operator: "is null", connector: "or" });
    return this;
  }

  orWhereNotNull(field: string): this {
    this.conditions.push({ field, operator: "is not null", connector: "or" });
    return this;
  }

  orWhereLike(field: string, pattern: string): this {
    this.conditions.push({ field, operator: "like", value: pattern, connector: "or" });
    this.params.push(pattern);
    return this;
  }

  join(table: string, on: string, alias?: string): this {
    this.joins.push({ type: "inner", table, on, alias });
    return this;
  }

  innerJoin(table: string, on: string, alias?: string): this {
    this.joins.push({ type: "inner", table, on, alias });
    return this;
  }

  leftJoin(table: string, on: string, alias?: string): this {
    this.joins.push({ type: "left", table, on, alias });
    return this;
  }

  rightJoin(table: string, on: string, alias?: string): this {
    this.joins.push({ type: "right", table, on, alias });
    return this;
  }

  fullJoin(table: string, on: string, alias?: string): this {
    this.joins.push({ type: "full", table, on, alias });
    return this;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): this {
    this.orders.push({ field, direction });
    return this;
  }

  orderByAsc(field: string): this {
    return this.orderBy(field, "asc");
  }

  orderByDesc(field: string): this {
    return this.orderBy(field, "desc");
  }

  groupBy(...fields: string[]): this {
    this.groupByFields.push(...fields);
    return this;
  }

  having(field: string, operator: QueryOperator, value?: unknown): this {
    this.havingConditions.push({ field, operator, value, connector: "and" });
    if (value !== undefined) this.params.push(value);
    return this;
  }

  orHaving(field: string, operator: QueryOperator, value?: unknown): this {
    this.havingConditions.push({ field, operator, value, connector: "or" });
    if (value !== undefined) this.params.push(value);
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  page(pageNumber: number, pageSize: number): this {
    this.limitCount = pageSize;
    this.offsetCount = (pageNumber - 1) * pageSize;
    return this;
  }

  getTable(): string {
    return this.table;
  }

  getFields(): string[] {
    return [...this.fields];
  }

  getConditions(): QueryCondition[] {
    return [...this.conditions];
  }

  getOrders(): QueryOrder[] {
    return [...this.orders];
  }

  getJoins(): QueryJoin[] {
    return [...this.joins];
  }

  getGroupBy(): string[] {
    return [...this.groupByFields];
  }

  getHaving(): QueryCondition[] {
    return [...this.havingConditions];
  }

  getLimit(): number | null {
    return this.limitCount;
  }

  getOffset(): number | null {
    return this.offsetCount;
  }

  isDistinctCheck(): boolean {
    return this.isDistinct;
  }

  getParams(): unknown[] {
    return [...this.params];
  }

  toSQL(): string {
    let sql = "SELECT ";
    if (this.isDistinct) sql += "DISTINCT ";
    sql += this.fields.length > 0 ? this.fields.join(", ") : "*";
    sql += ` FROM ${this.table}`;
    for (const join of this.joins) {
      sql += ` ${join.type.toUpperCase()} JOIN ${join.table}`;
      if (join.alias) sql += ` AS ${join.alias}`;
      sql += ` ON ${join.on}`;
    }
    if (this.conditions.length > 0) {
      sql += " WHERE " + this.conditions.map((c, i) => {
        const connector = i > 0 ? ` ${c.connector?.toUpperCase()} ` : "";
        return connector + this.conditionToSQL(c);
      }).join("");
    }
    if (this.groupByFields.length > 0) {
      sql += " GROUP BY " + this.groupByFields.join(", ");
    }
    if (this.havingConditions.length > 0) {
      sql += " HAVING " + this.havingConditions.map((c, i) => {
        const connector = i > 0 ? ` ${c.connector?.toUpperCase()} ` : "";
        return connector + this.conditionToSQL(c);
      }).join("");
    }
    if (this.orders.length > 0) {
      sql += " ORDER BY " + this.orders.map((o) => `${o.field} ${o.direction.toUpperCase()}`).join(", ");
    }
    if (this.limitCount !== null) sql += ` LIMIT ${this.limitCount}`;
    if (this.offsetCount !== null) sql += ` OFFSET ${this.offsetCount}`;
    return sql;
  }

  private conditionToSQL(condition: QueryCondition): string {
    switch (condition.operator) {
      case "is null": return `${condition.field} IS NULL`;
      case "is not null": return `${condition.field} IS NOT NULL`;
      case "in": return `${condition.field} IN (${condition.values?.map(() => "?").join(", ")})`;
      case "not in": return `${condition.field} NOT IN (${condition.values?.map(() => "?").join(", ")})`;
      case "between": return `${condition.field} BETWEEN ? AND ?`;
      case "like": return `${condition.field} LIKE ?`;
      case "contains": return `${condition.field} LIKE '%' || ? || '%'`;
      case "starts with": return `${condition.field} LIKE ? || '%'`;
      case "ends with": return `${condition.field} LIKE '%' || ?`;
      default: return `${condition.field} ${condition.operator} ?`;
    }
  }

  toJSON(): QueryOptions {
    return {
      table: this.table,
      fields: [...this.fields],
      conditions: [...this.conditions],
      orders: [...this.orders],
      joins: [...this.joins],
      groupBy: [...this.groupByFields],
      having: [...this.havingConditions],
      limit: this.limitCount ?? undefined,
      offset: this.offsetCount ?? undefined,
      distinct: this.isDistinct,
    };
  }

  reset(): this {
    this.table = "";
    this.fields = [];
    this.conditions = [];
    this.orders = [];
    this.joins = [];
    this.groupByFields = [];
    this.havingConditions = [];
    this.limitCount = null;
    this.offsetCount = null;
    this.isDistinct = false;
    this.params = [];
    return this;
  }

  clone(): QueryBuilder {
    const clone = new QueryBuilder();
    clone.table = this.table;
    clone.fields = [...this.fields];
    clone.conditions = [...this.conditions];
    clone.orders = [...this.orders];
    clone.joins = [...this.joins];
    clone.groupByFields = [...this.groupByFields];
    clone.havingConditions = [...this.havingConditions];
    clone.limitCount = this.limitCount;
    clone.offsetCount = this.offsetCount;
    clone.isDistinct = this.isDistinct;
    clone.params = [...this.params];
    return clone;
  }

  execute<T>(data: T[]): T[] {
    let result = [...data];
    if (this.conditions.length > 0) {
      result = result.filter((item) => this.matchesConditions(item));
    }
    if (this.orders.length > 0) {
      result = this.sortResults(result);
    }
    if (this.offsetCount !== null) {
      result = result.slice(this.offsetCount);
    }
    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }
    if (this.fields.length > 0 && this.fields[0] !== "*") {
      result = result.map((item) => this.projectFields(item)) as any;
    }
    if (this.isDistinct) {
      const seen = new Set<string>();
      result = result.filter((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return result;
  }

  private matchesConditions(item: unknown): boolean {
    const obj = item as Record<string, unknown>;
    let matches = true;
    let isFirst = true;
    for (const condition of this.conditions) {
      const conditionResult = this.matchesCondition(obj, condition);
      if (isFirst) {
        matches = conditionResult;
        isFirst = false;
      } else if (condition.connector === "or") {
        matches = matches || conditionResult;
      } else {
        matches = matches && conditionResult;
      }
    }
    return matches;
  }

  private matchesCondition(obj: Record<string, unknown>, condition: QueryCondition): boolean {
    const value = obj[condition.field];
    switch (condition.operator) {
      case "=": return value === condition.value;
      case "!=": return value !== condition.value;
      case ">": return (value as number) > (condition.value as number);
      case ">=": return (value as number) >= (condition.value as number);
      case "<": return (value as number) < (condition.value as number);
      case "<=": return (value as number) <= (condition.value as number);
      case "like": return typeof value === "string" && typeof condition.value === "string" && new RegExp(condition.value.replace(/%/g, ".*").replace(/_/g, ".")).test(value);
      case "in": return Array.isArray(condition.values) && condition.values.includes(value);
      case "not in": return Array.isArray(condition.values) && !condition.values.includes(value);
      case "between": return (value as number) >= (condition.start as number) && (value as number) <= (condition.end as number);
      case "is null": return value === null || value === undefined;
      case "is not null": return value !== null && value !== undefined;
      case "contains": return typeof value === "string" && typeof condition.value === "string" && value.includes(condition.value);
      case "starts with": return typeof value === "string" && typeof condition.value === "string" && value.startsWith(condition.value);
      case "ends with": return typeof value === "string" && typeof condition.value === "string" && value.endsWith(condition.value);
      default: return false;
    }
  }

  private sortResults<T>(data: T[]): T[] {
    return [...data].sort((a, b) => {
      for (const order of this.orders) {
        const aVal = (a as Record<string, unknown>)[order.field];
        const bVal = (b as Record<string, unknown>)[order.field];
        if (aVal < bVal) return order.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return order.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  private projectFields<T>(item: T): Partial<T> {
    const result: Record<string, unknown> = {};
    const obj = item as Record<string, unknown>;
    for (const field of this.fields) {
      if (field in obj) {
        result[field] = obj[field];
      }
    }
    return result as Partial<T>;
  }

  count(data: unknown[]): number {
    return this.execute(data).length;
  }

  first<T>(data: T[]): T | undefined {
    const result = this.execute(data);
    return result[0];
  }

  last<T>(data: T[]): T | undefined {
    const result = this.execute(data);
    return result[result.length - 1];
  }

  exists(data: unknown[]): boolean {
    return this.count(data) > 0;
  }

  pluck<T>(data: T[], field: string): unknown[] {
    return this.execute(data).map((item) => (item as Record<string, unknown>)[field]);
  }

  sum(data: unknown[], field: string): number {
    const items = this.execute(data) as Record<string, unknown>[];
    let total = 0;
    for (const item of items) {
      const v = item[field] as number | undefined;
      total += v ?? 0;
    }
    return total;
  }

  avg(data: unknown[], field: string): number {
    const result = this.execute(data);
    if (result.length === 0) return 0;
    return this.sum(data, field) / result.length;
  }

  min(data: unknown[], field: string): number {
    const result = this.execute(data).map((item) => (item as Record<string, unknown>)[field] as number);
    return Math.min(...result);
  }

  max(data: unknown[], field: string): number {
    const result = this.execute(data).map((item) => (item as Record<string, unknown>)[field] as number);
    return Math.max(...result);
  }

  chunk<T>(data: T[], size: number): T[][] {
    const result = this.execute(data);
    const chunks: T[][] = [];
    for (let i = 0; i < result.length; i += size) {
      chunks.push(result.slice(i, i + size));
    }
    return chunks;
  }

  paginate<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; pages: number; currentPage: number } {
    let total = data.length;
    const pages = Math.ceil(total / pageSize);
    const currentPage = Math.max(1, Math.min(page, pages));
    const start = (currentPage - 1) * pageSize;
    this.limitCount = pageSize;
    this.offsetCount = start;
    return {
      items: this.execute(data),
      total,
      pages,
      currentPage,
    };
  }
}

export function createQueryBuilder(): QueryBuilder {
  return new QueryBuilder();
}

export class CookieManager {
  private cookies: Map<string, { value: string; expires?: number; path?: string; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none" }> = new Map();

  set(name: string, value: string, options: { expires?: number | Date; maxAge?: number; path?: string; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none" } = {}): this {
    const expires = options.expires instanceof Date ? options.expires.getTime() : options.expires;
    this.cookies.set(name, {
      value,
      expires,
      path: options.path,
      domain: options.domain,
      secure: options.secure,
      httpOnly: options.httpOnly,
      sameSite: options.sameSite,
    });
    this.writeToDocument(name);
    return this;
  }

  get(name: string): string | undefined {
    this.readFromDocument();
    return this.cookies.get(name)?.value;
  }

  has(name: string): boolean {
    this.readFromDocument();
    return this.cookies.has(name) && !this.isExpired(name);
  }

  remove(name: string): this {
    this.cookies.delete(name);
    if (typeof document !== "undefined") {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
    return this;
  }

  clear(): this {
    for (const name of this.cookies.keys()) {
      this.remove(name);
    }
    return this;
  }

  getAll(): Record<string, string> {
    this.readFromDocument();
    const result: Record<string, string> = {};
    for (const [name, cookie] of this.cookies) {
      if (!this.isExpired(name)) {
        result[name] = cookie.value;
      }
    }
    return result;
  }

  keys(): string[] {
    this.readFromDocument();
    return [...this.cookies.keys()].filter((name) => !this.isExpired(name));
  }

  values(): string[] {
    this.readFromDocument();
    return [...this.cookies.entries()].filter(([name]) => !this.isExpired(name)).map(([, cookie]) => cookie.value);
  }

  count(): number {
    return this.keys().length;
  }

  private isExpired(name: string): boolean {
    const cookie = this.cookies.get(name);
    if (!cookie?.expires) return false;
    return Date.now() > cookie.expires;
  }

  private writeToDocument(name: string): void {
    if (typeof document === "undefined") return;
    const cookie = this.cookies.get(name);
    if (!cookie) return;
    let cookieStr = `${name}=${encodeURIComponent(cookie.value)}`;
    if (cookie.expires) {
      cookieStr += `; expires=${new Date(cookie.expires).toUTCString()}`;
    }
    if (cookie.path) cookieStr += `; path=${cookie.path}`;
    if (cookie.domain) cookieStr += `; domain=${cookie.domain}`;
    if (cookie.secure) cookieStr += "; secure";
    if (cookie.httpOnly) cookieStr += "; HttpOnly";
    if (cookie.sameSite) cookieStr += `; SameSite=${cookie.sameSite}`;
    document.cookie = cookieStr;
  }

  private readFromDocument(): void {
    if (typeof document === "undefined") return;
    const cookies = document.cookie.split("; ");
    for (const cookie of cookies) {
      const [name, value] = cookie.split("=");
      if (name && value !== undefined) {
        if (!this.cookies.has(name)) {
          this.cookies.set(name, { value: decodeURIComponent(value) });
        } else {
          this.cookies.get(name)!.value = decodeURIComponent(value);
        }
      }
    }
  }

  setExpires(name: string, expires: number | Date): this {
    const cookie = this.cookies.get(name);
    if (cookie) {
      cookie.expires = expires instanceof Date ? expires.getTime() : expires;
      this.writeToDocument(name);
    }
    return this;
  }

  setPath(name: string, path: string): this {
    const cookie = this.cookies.get(name);
    if (cookie) {
      cookie.path = path;
      this.writeToDocument(name);
    }
    return this;
  }

  setDomain(name: string, domain: string): this {
    const cookie = this.cookies.get(name);
    if (cookie) {
      cookie.domain = domain;
      this.writeToDocument(name);
    }
    return this;
  }

  setSecure(name: string, secure: boolean): this {
    const cookie = this.cookies.get(name);
    if (cookie) {
      cookie.secure = secure;
      this.writeToDocument(name);
    }
    return this;
  }

  setHttpOnly(name: string, httpOnly: boolean): this {
    const cookie = this.cookies.get(name);
    if (cookie) {
      cookie.httpOnly = httpOnly;
      this.writeToDocument(name);
    }
    return this;
  }

  setSameSite(name: string, sameSite: "strict" | "lax" | "none"): this {
    const cookie = this.cookies.get(name);
    if (cookie) {
      cookie.sameSite = sameSite;
      this.writeToDocument(name);
    }
    return this;
  }

  toJSON(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }
}

export function createCookieManager(): CookieManager {
  return new CookieManager();
}

export class StorageManager {
  private storage: Storage | null = null;
  private prefix: string = "";
  private memoryStorage: Map<string, string> = new Map();

  constructor(type: "local" | "session" | "memory" = "local", prefix: string = "") {
    this.prefix = prefix;
    if (type === "memory") {
      this.storage = null;
    } else if (typeof window !== "undefined") {
      this.storage = type === "local" ? window.localStorage : window.sessionStorage;
    }
  }

  set(key: string, value: unknown): this {
    const fullKey = this.getFullKey(key);
    const serialized = JSON.stringify(value);
    if (this.storage) {
      this.storage.setItem(fullKey, serialized);
    } else {
      this.memoryStorage.set(fullKey, serialized);
    }
    return this;
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const fullKey = this.getFullKey(key);
    let value: string | null = null;
    if (this.storage) {
      value = this.storage.getItem(fullKey);
    } else {
      value = this.memoryStorage.get(fullKey) ?? null;
    }
    if (value === null) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  has(key: string): boolean {
    const fullKey = this.getFullKey(key);
    if (this.storage) {
      return this.storage.getItem(fullKey) !== null;
    }
    return this.memoryStorage.has(fullKey);
  }

  remove(key: string): this {
    const fullKey = this.getFullKey(key);
    if (this.storage) {
      this.storage.removeItem(fullKey);
    } else {
      this.memoryStorage.delete(fullKey);
    }
    return this;
  }

  clear(): this {
    if (this.storage) {
      if (this.prefix) {
        this.keys().forEach((key) => this.remove(key));
      } else {
        this.storage.clear();
      }
    } else {
      if (this.prefix) {
        this.keys().forEach((key) => this.remove(key));
      } else {
        this.memoryStorage.clear();
      }
    }
    return this;
  }

  keys(): string[] {
    let allKeys: string[] = [];
    if (this.storage) {
      allKeys = [...Array(this.storage.length).keys()].map((i) => this.storage!.key(i)!).filter(Boolean) as string[];
    } else {
      allKeys = [...this.memoryStorage.keys()];
    }
    if (this.prefix) {
      return allKeys.filter((key) => key.startsWith(this.prefix)).map((key) => key.slice(this.prefix.length));
    }
    return allKeys;
  }

  values(): unknown[] {
    return this.keys().map((key) => this.get(key));
  }

  entries(): Array<{ key: string; value: unknown }> {
    return this.keys().map((key) => ({ key, value: this.get(key) }));
  }

  count(): number {
    return this.keys().length;
  }

  size(): number {
    let total = 0;
    for (const key of this.keys()) {
      const value = this.storage?.getItem(this.getFullKey(key)) ?? this.memoryStorage.get(this.getFullKey(key));
      if (value) {
        total += key.length + value.length;
      }
    }
    return total;
  }

  setMany(entries: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value);
    }
    return this;
  }

  getMany(keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = this.get(key);
    }
    return result;
  }

  removeMany(keys: string[]): this {
    for (const key of keys) {
      this.remove(key);
    }
    return this;
  }

  hasAll(keys: string[]): boolean {
    return keys.every((key) => this.has(key));
  }

  hasAny(keys: string[]): boolean {
    return keys.some((key) => this.has(key));
  }

  setDefault(key: string, value: unknown): boolean {
    if (!this.has(key)) {
      this.set(key, value);
      return true;
    }
    return false;
  }

  increment(key: string, by: number = 1): number {
    const current = this.get<number>(key, 0) ?? 0;
    const newValue = current + by;
    this.set(key, newValue);
    return newValue;
  }

  decrement(key: string, by: number = 1): number {
    return this.increment(key, -by);
  }

  push<T>(key: string, value: T): T[] {
    const array = this.get<T[]>(key, []) ?? [];
    array.push(value);
    this.set(key, array);
    return array;
  }

  pop<T>(key: string): T | undefined {
    const array = this.get<T[]>(key, []) ?? [];
    const value = array.pop();
    this.set(key, array);
    return value;
  }

  shift<T>(key: string): T | undefined {
    const array = this.get<T[]>(key, []) ?? [];
    const value = array.shift();
    this.set(key, array);
    return value;
  }

  unshift<T>(key: string, value: T): T[] {
    const array = this.get<T[]>(key, []) ?? [];
    array.unshift(value);
    this.set(key, array);
    return array;
  }

  addToSet<T>(key: string, value: T): T[] {
    const array = this.get<T[]>(key, []) ?? [];
    if (!array.includes(value)) {
      array.push(value);
      this.set(key, array);
    }
    return array;
  }

  removeFromSet<T>(key: string, value: T): T[] {
    const array = this.get<T[]>(key, []) ?? [];
    const filtered = array.filter((v) => v !== value);
    this.set(key, filtered);
    return filtered;
  }

  merge(key: string, value: Record<string, unknown>): Record<string, unknown> {
    const current = this.get<Record<string, unknown>>(key, {}) ?? {};
    const merged = { ...current, ...value };
    this.set(key, merged);
    return merged;
  }

  toggle(key: string): boolean {
    const current = this.get<boolean>(key, false) ?? false;
    const newValue = !current;
    this.set(key, newValue);
    return newValue;
  }

  isAvailable(): boolean {
    if (this.storage) {
      try {
        const testKey = "__tw_test__";
        this.storage.setItem(testKey, "1");
        this.storage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  getPrefix(): string {
    return this.prefix;
  }

  setPrefix(prefix: string): this {
    this.prefix = prefix;
    return this;
  }

  exportJSON(): string {
    return JSON.stringify(Object.fromEntries(this.entries().map((e) => [e.key, e.value])), null, 2);
  }

  importJSON(json: string): this {
    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      this.setMany(data);
    } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
    return this;
  }

  private getFullKey(key: string): string {
    return this.prefix + key;
  }

  toJSON(): string {
    return JSON.stringify({ count: this.count(), size: this.size(), prefix: this.prefix }, null, 2);
  }
}

export function createStorageManager(type?: "local" | "session" | "memory", prefix?: string): StorageManager {
  return new StorageManager(type, prefix);
}
