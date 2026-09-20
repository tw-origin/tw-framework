/**
 * IndexedDB wrapper -- promise-based API for IndexedDB with typed stores.
 * @module runtime/storage
 */

export interface IDBStoreOptions {
  name: string;
  keyPath: string | string[];
  autoIncrement?: boolean;
  indexes?: Array<{ name: string; keyPath: string | string[]; unique?: boolean; multiEntry?: boolean }>;
}

export interface IDBDatabaseOptions {
  name: string;
  version: number;
  stores: IDBStoreOptions[];
}

export interface IDBQueryOptions {
  index?: string;
  range?: IDBKeyRange;
  direction?: IDBCursorDirection;
  limit?: number;
  offset?: number;
  filter?: (value: unknown) => boolean;
  map?: (value: unknown) => unknown;
}

export class IndexedDBWrapper {
  private db: IDBDatabase | null = null;
  private options: IDBDatabaseOptions;
  private isConnected: boolean = false;
  private pendingTransactions: Set<IDBTransaction> = new Set();
  private stats = { totalOperations: 0, reads: 0, writes: 0, deletes: 0, errors: 0 };

  constructor(options: IDBDatabaseOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.name, this.options.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.isConnected = true;
        this.db.onversionchange = () => {
          this.db?.close();
          this.isConnected = false;
          this.db = null;
        };
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        for (const store of this.options.stores) {
          if (!db.objectStoreNames.contains(store.name)) {
            const objectStore = db.createObjectStore(store.name, {
              keyPath: store.keyPath,
              autoIncrement: store.autoIncrement ?? false,
            });
            if (store.indexes) {
              for (const index of store.indexes) {
                objectStore.createIndex(index.name, index.keyPath, {
                  unique: index.unique ?? false,
                  multiEntry: index.multiEntry ?? false,
                });
              }
            }
          }
        }
      };
      request.onblocked = () => reject(new Error("IndexedDB connection blocked"));
    });
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isConnected = false;
    }
  }

  isConnectedCheck(): boolean {
    return this.isConnected;
  }

  private getStore(storeName: string, mode: IDBTransactionMode = "readonly"): IDBObjectStore {
    if (!this.db) throw new Error("Database not connected");
    const transaction = this.db.transaction(storeName, mode);
    this.pendingTransactions.add(transaction);
    transaction.oncomplete = () => this.pendingTransactions.delete(transaction);
    transaction.onerror = () => { this.stats.errors++; this.pendingTransactions.delete(transaction); };
    transaction.onabort = () => this.pendingTransactions.delete(transaction);
    return transaction.objectStore(storeName);
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    return this.promisifyRequest(store.get(key) as IDBRequest<T | undefined>);
  }

  async getAll<T>(storeName: string, query?: IDBQueryOptions): Promise<T[]> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    if (query?.index) {
      const index = store.index(query.index);
      const range = query.range;
      const direction = query.direction ?? "next";
      const request = index.getAll(range, query.limit);
      return this.promisifyRequest(request as IDBRequest<T[]>);
    }
    const request = store.getAll(query?.range, query?.limit);
    let result = await this.promisifyRequest(request as IDBRequest<T[]>);
    if (query?.offset) {
      result = result.slice(query.offset);
    }
    if (query?.filter) {
      result = result.filter(query.filter);
    }
    if (query?.map) {
      result = result.map(query.map) as T[];
    }
    return result;
  }

  async set<T>(storeName: string, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    this.stats.totalOperations++;
    this.stats.writes++;
    const store = this.getStore(storeName, "readwrite");
    const request = key !== undefined ? store.put(value, key) : store.put(value);
    return this.promisifyRequest(request);
  }

  async setAll<T>(storeName: string, values: T[]): Promise<void> {
    this.stats.totalOperations++;
    this.stats.writes += values.length;
    const store = this.getStore(storeName, "readwrite");
    for (const value of values) {
      store.put(value);
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    this.stats.totalOperations++;
    this.stats.deletes++;
    const store = this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAll(storeName: string, keys: IDBValidKey[]): Promise<void> {
    this.stats.totalOperations++;
    this.stats.deletes += keys.length;
    const store = this.getStore(storeName, "readwrite");
    for (const key of keys) {
      store.delete(key);
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    this.stats.totalOperations++;
    const store = this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName: string, query?: IDBQueryOptions): Promise<number> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    if (query?.index) {
      const index = store.index(query.index);
      const request = index.count(query.range);
      return this.promisifyRequest(request);
    }
    const request = store.count(query?.range);
    return this.promisifyRequest(request);
  }

  async keys(storeName: string, query?: IDBQueryOptions): Promise<IDBValidKey[]> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    if (query?.index) {
      const index = store.index(query.index);
      const request = index.getAllKeys(query.range, query.limit);
      return this.promisifyRequest(request);
    }
    const request = store.getAllKeys(query?.range, query?.limit);
    return this.promisifyRequest(request);
  }

  async has(storeName: string, key: IDBValidKey): Promise<boolean> {
    const value = await this.get(storeName, key);
    return value !== undefined;
  }

  async forEach<T>(storeName: string, callback: (value: T, key: IDBValidKey) => void, query?: IDBQueryOptions): Promise<void> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const source = query?.index ? store.index(query.index) : store;
      const range = query?.range;
      const direction = query?.direction ?? "next";
      const request = source.openCursor(range, direction);
      let count = 0;
      let skipped = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        if (query?.offset && skipped < query.offset) {
          skipped++;
          cursor.continue();
          return;
        }
        if (query?.limit && count >= query.limit) {
          resolve();
          return;
        }
        callback(cursor.value as T, cursor.key);
        count++;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async map<T, R>(storeName: string, mapper: (value: T, key: IDBValidKey) => R, query?: IDBQueryOptions): Promise<R[]> {
    const results: R[] = [];
    await this.forEach<T>(storeName, (value, key) => {
      results.push(mapper(value, key));
    }, query);
    return results;
  }

  async filter<T>(storeName: string, predicate: (value: T, key: IDBValidKey) => boolean, query?: IDBQueryOptions): Promise<T[]> {
    const results: T[] = [];
    await this.forEach<T>(storeName, (value, key) => {
      if (predicate(value, key)) {
        results.push(value);
      }
    }, query);
    return results;
  }

  async find<T>(storeName: string, predicate: (value: T, key: IDBValidKey) => boolean, query?: IDBQueryOptions): Promise<T | undefined> {
    let result: T | undefined;
    await this.forEach<T>(storeName, (value, key) => {
      if (!result && predicate(value, key)) {
        result = value;
      }
    }, query);
    return result;
  }

  async reduce<T, R>(storeName: string, reducer: (acc: R, value: T, key: IDBValidKey) => R, initial: R, query?: IDBQueryOptions): Promise<R> {
    let acc = initial;
    await this.forEach<T>(storeName, (value, key) => {
      acc = reducer(acc, value, key);
    }, query);
    return acc;
  }

  async some<T>(storeName: string, predicate: (value: T, key: IDBValidKey) => boolean, query?: IDBQueryOptions): Promise<boolean> {
    let found = false;
    await this.forEach<T>(storeName, (value, key) => {
      if (!found && predicate(value, key)) {
        found = true;
      }
    }, query);
    return found;
  }

  async every<T>(storeName: string, predicate: (value: T, key: IDBValidKey) => boolean, query?: IDBQueryOptions): Promise<boolean> {
    let allMatch = true;
    await this.forEach<T>(storeName, (value, key) => {
      if (allMatch && !predicate(value, key)) {
        allMatch = false;
      }
    }, query);
    return allMatch;
  }

  async getByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(key);
    return this.promisifyRequest(request as IDBRequest<T[]>);
  }

  async getFirstByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T | undefined> {
    this.stats.totalOperations++;
    this.stats.reads++;
    const store = this.getStore(storeName);
    const index = store.index(indexName);
    const request = index.get(key);
    return this.promisifyRequest(request as IDBRequest<T | undefined>);
  }

  async deleteByIndex(storeName: string, indexName: string, key: IDBValidKey): Promise<void> {
    this.stats.totalOperations++;
    const records = await this.getByIndex(storeName, indexName, key);
    const keys = records.map((r) => (r as Record<string, unknown>)[this.getStoreKeyPath(storeName)] as IDBValidKey);
    await this.deleteAll(storeName, keys);
  }

  async update<T>(storeName: string, key: IDBValidKey, updater: (value: T) => T): Promise<boolean> {
    const current = await this.get<T>(storeName, key);
    if (current === undefined) return false;
    const updated = updater(current);
    await this.set(storeName, updated, key);
    return true;
  }

  async updateByIndex<T>(storeName: string, indexName: string, key: IDBValidKey, updater: (value: T) => T): Promise<number> {
    const records = await this.getByIndex<T>(storeName, indexName, key);
    let updated = 0;
    for (const record of records) {
      const updatedRecord = updater(record);
      await this.set(storeName, updatedRecord);
      updated++;
    }
    return updated;
  }

  async batch<T, R>(operations: Array<{ type: "get" | "set" | "delete"; store: string; key?: IDBValidKey; value?: T }>): Promise<R[]> {
    const results: R[] = [];
    for (const op of operations) {
      switch (op.type) {
        case "get":
          if (op.key !== undefined) {
            results.push(await this.get<R>(op.store, op.key) as R);
          }
          break;
        case "set":
          if (op.value !== undefined) {
            if (op.key !== undefined) {
              await this.set(op.store, op.value, op.key);
            } else {
              await this.set(op.store, op.value);
            }
            results.push(undefined as unknown as R);
          }
          break;
        case "delete":
          if (op.key !== undefined) {
            await this.delete(op.store, op.key);
            results.push(undefined as unknown as R);
          }
          break;
      }
    }
    return results;
  }

  async transaction(stores: string[], mode: IDBTransactionMode, callback: (stores: Record<string, IDBObjectStore>) => Promise<void>): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    const transaction = this.db.transaction(stores, mode);
    const storeMap: Record<string, IDBObjectStore> = {};
    for (const storeName of stores) {
      storeMap[storeName] = transaction.objectStore(storeName);
    }
    this.pendingTransactions.add(transaction);
    await callback(storeMap);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => { this.pendingTransactions.delete(transaction); resolve(); };
      transaction.onerror = () => { this.pendingTransactions.delete(transaction); this.stats.errors++; reject(transaction.error); };
      transaction.onabort = () => { this.pendingTransactions.delete(transaction); reject(transaction.error); };
    });
  }

  getStoreNames(): string[] {
    if (!this.db) return [];
    return [...this.db.objectStoreNames];
  }

  getStoreKeyPath(storeName: string): string {
    if (!this.db) return "";
    const store = this.options.stores.find((s) => s.name === storeName);
    const keyPath = store?.keyPath;
    return Array.isArray(keyPath) ? keyPath[0] : keyPath;
  }

  hasStore(storeName: string): boolean {
    if (!this.db) return false;
    return this.db.objectStoreNames.contains(storeName);
  }

  getIndexNames(storeName: string): string[] {
    const store = this.options.stores.find((s) => s.name === storeName);
    return store?.indexes?.map((i) => i.name) ?? [];
  }

  hasIndex(storeName: string, indexName: string): boolean {
    return this.getIndexNames(storeName).includes(indexName);
  }

  getDatabaseName(): string {
    return this.options.name;
  }

  getDatabaseVersion(): number {
    return this.options.version;
  }

  getPendingTransactionCount(): number {
    return this.pendingTransactions.size;
  }

  getStats(): { totalOperations: number; reads: number; writes: number; deletes: number; errors: number; connected: boolean } {
    return { ...this.stats, connected: this.isConnected };
  }

  resetStats(): void {
    this.stats = { totalOperations: 0, reads: 0, writes: 0, deletes: 0, errors: 0 };
  }

  async deleteDatabase(): Promise<void> {
    await this.disconnect();
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.options.name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database deletion blocked"));
    });
  }

  static isSupported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createIndexedDBWrapper(options: IDBDatabaseOptions): IndexedDBWrapper {
  return new IndexedDBWrapper(options);
}

export class WebComponentRegistry {
  private components: Map<string, { name: string; constructor: CustomElementConstructor; options: ElementDefinitionOptions }> = new Map();
  private observers: Map<string, MutationObserver> = new Map();

  define(name: string, constructor: CustomElementConstructor, options?: ElementDefinitionOptions): boolean {
    if (this.components.has(name)) return false;
    if (typeof customElements !== "undefined") {
      try {
        customElements.define(name, constructor, options);
      } catch {
        return false;
      }
    }
    this.components.set(name, { name, constructor, options: options ?? {} });
    return true;
  }

  get(name: string): { name: string; constructor: CustomElementConstructor; options: ElementDefinitionOptions } | undefined {
    return this.components.get(name);
  }

  has(name: string): boolean {
    return this.components.has(name);
  }

  getNames(): string[] {
    return [...this.components.keys()];
  }

  getCount(): number {
    return this.components.size;
  }

  create(name: string): HTMLElement | null {
    if (!this.has(name)) return null;
    return document.createElement(name);
  }

  createWithAttributes(name: string, attributes: Record<string, string>): HTMLElement | null {
    const element = this.create(name);
    if (!element) return null;
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
    return element;
  }

  createWithProperties(name: string, properties: Record<string, unknown>): HTMLElement | null {
    const element = this.create(name);
    if (!element) return null;
    Object.assign(element, properties);
    return element;
  }

  observe(name: string, callback: MutationCallback): void {
    const elements = document.querySelectorAll(name);
    if (elements.length === 0) return;
    const observer = new MutationObserver(callback);
    elements.forEach((el) => observer.observe(el, { attributes: true, childList: true, subtree: true, characterData: true }));
    this.observers.set(name, observer);
  }

  unobserve(name: string): void {
    const observer = this.observers.get(name);
    if (observer) {
      observer.disconnect();
      this.observers.delete(name);
    }
  }

  unobserveAll(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
  }

  getObserverCount(): number {
    return this.observers.size;
  }

  clear(): void {
    this.unobserveAll();
    this.components.clear();
  }

  whenDefined(name: string): Promise<void> {
    if (typeof customElements !== "undefined") {
      return customElements.whenDefined(name) as unknown as Promise<void>;
    }
    return Promise.resolve();
  }

  isDefined(name: string): boolean {
    if (typeof customElements !== "undefined") {
      try {
        return !!customElements.get(name);
      } catch {
        return false;
      }
    }
    return this.components.has(name);
  }

  getDefinition(name: string): CustomElementConstructor | undefined {
    if (typeof customElements !== "undefined") {
      try {
        return customElements.get(name);
      } catch {
        return undefined;
      }
    }
    return this.components.get(name)?.constructor;
  }

  upgrade(element: Element): void {
    if (typeof customElements !== "undefined") {
      try {
        customElements.upgrade(element);
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
    }
  }

  toJSON(): string {
    return JSON.stringify({ components: this.getCount(), observers: this.getObserverCount() }, null, 2);
  }
}

export function createWebComponentRegistry(): WebComponentRegistry {
  return new WebComponentRegistry();
}

export class CanvasUtils {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, contextType: "2d" | "webgl" | "webgl2" = "2d") {
    this.canvas = canvas;
    this.ctx = canvas.getContext(contextType) as CanvasRenderingContext2D;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  static create(width: number, height: number, contextType: "2d" | "webgl" | "webgl2" = "2d"): CanvasUtils {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return new CanvasUtils(canvas, contextType);
  }

  getContext(): CanvasRenderingContext2D { return this.ctx; }
  getCanvas(): HTMLCanvasElement { return this.canvas; }
  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }

  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
  }

  clear(): void { this.ctx.clearRect(0, 0, this.width, this.height); }
  clearWith(color: string): void { this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, this.width, this.height); }

  fillBackground(color: string): void { this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, this.width, this.height); }

  drawRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, w, h);
  }

  drawCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  strokeCircle(x: number, y: number, radius: number, color: string, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawText(text: string, x: number, y: number, color: string, font: string = "16px sans-serif"): void {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.fillText(text, x, y);
  }

  strokeText(text: string, x: number, y: number, color: string, font: string = "16px sans-serif", lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.font = font;
    this.ctx.strokeText(text, x, y);
  }

  drawImage(image: CanvasImageSource, x: number, y: number, w?: number, h?: number): void {
    if (w !== undefined && h !== undefined) {
      this.ctx.drawImage(image, x, y, w, h);
    } else {
      this.ctx.drawImage(image, x, y);
    }
  }

  drawPath(points: Array<{ x: number; y: number }>, color: string, lineWidth: number = 1, close: boolean = false): void {
    if (points.length === 0) return;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    if (close) this.ctx.closePath();
    this.ctx.stroke();
  }

  fillPath(points: Array<{ x: number; y: number }>, color: string): void {
    if (points.length === 0) return;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, color: string, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, startAngle, endAngle);
    this.ctx.stroke();
  }

  fillArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, startAngle, endAngle);
    this.ctx.lineTo(x, y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawEllipse(x: number, y: number, radiusX: number, radiusY: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  strokeEllipse(x: number, y: number, radiusX: number, radiusY: number, color: string, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: string): void {
    this.fillPath([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], color);
  }

  strokeTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: string, lineWidth: number = 1): void {
    this.drawPath([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], color, lineWidth, true);
  }

  drawPolygon(points: Array<{ x: number; y: number }>, color: string): void {
    this.fillPath(points, color);
  }

  strokePolygon(points: Array<{ x: number; y: number }>, color: string, lineWidth: number = 1): void {
    this.drawPath(points, color, lineWidth, true);
  }

  drawGradient(x: number, y: number, w: number, h: number, colors: string[], direction: "horizontal" | "vertical" = "vertical"): void {
    const gradient = direction === "vertical"
      ? this.ctx.createLinearGradient(x, y, x, y + h)
      : this.ctx.createLinearGradient(x, y, x + w, y);
    for (let i = 0; i < colors.length; i++) {
      gradient.addColorStop(i / (colors.length - 1), colors[i]);
    }
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x, y, w, h);
  }

  drawRadialGradient(x: number, y: number, innerRadius: number, outerRadius: number, colors: string[]): void {
    const gradient = this.ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
    for (let i = 0; i < colors.length; i++) {
      gradient.addColorStop(i / (colors.length - 1), colors[i]);
    }
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  setShadow(color: string, blur: number = 5, offsetX: number = 0, offsetY: number = 0): void {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
    this.ctx.shadowOffsetX = offsetX;
    this.ctx.shadowOffsetY = offsetY;
  }

  clearShadow(): void {
    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  setAlpha(alpha: number): void { this.ctx.globalAlpha = alpha; }
  resetAlpha(): void { this.ctx.globalAlpha = 1; }

  setCompositeOperation(operation: GlobalCompositeOperation): void { this.ctx.globalCompositeOperation = operation; }
  resetCompositeOperation(): void { this.ctx.globalCompositeOperation = "source-over"; }

  save(): void { this.ctx.save(); }
  restore(): void { this.ctx.restore(); }

  translate(x: number, y: number): void { this.ctx.translate(x, y); }
  rotate(angle: number): void { this.ctx.rotate(angle); }
  scale(sx: number, sy: number): void { this.ctx.scale(sx, sy); }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.ctx.transform(a, b, c, d, e, f); }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.ctx.setTransform(a, b, c, d, e, f); }
  resetTransform(): void { this.ctx.setTransform(1, 0, 0, 1, 0, 0); }

  clip(path?: Path2D, fillRule?: CanvasFillRule): void {
    if (path) { this.ctx.clip(path, fillRule); } else { this.ctx.clip(); }
  }

  createPattern(image: CanvasImageSource, repetition: string | null = "repeat"): CanvasPattern | null {
    return this.ctx.createPattern(image, repetition);
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return this.ctx.createLinearGradient(x0, y0, x1, y1);
  }

  createRadialGradient2(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  }

  getImageData(x: number, y: number, w: number, h: number): ImageData {
    return this.ctx.getImageData(x, y, w, h);
  }

  putImageData(imageData: ImageData, x: number, y: number): void {
    this.ctx.putImageData(imageData, x, y);
  }

  toDataURL(type: string = "image/png", quality?: number): string {
    return this.canvas.toDataURL(type, quality);
  }

  toBlob(type: string = "image/png", quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error("Failed to create blob"));
      }, type, quality);
    });
  }

  download(filename: string, type: string = "image/png"): void {
    const link = document.createElement("a");
    link.download = filename;
    link.href = this.toDataURL(type);
    link.click();
  }

  getPixel(x: number, y: number): { r: number; g: number; b: number; a: number } {
    const imageData = this.getImageData(x, y, 1, 1);
    const data = imageData.data;
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  }

  setPixel(x: number, y: number, r: number, g: number, b: number, a: number = 255): void {
    const imageData = this.ctx.createImageData(1, 1);
    imageData.data[0] = r;
    imageData.data[1] = g;
    imageData.data[2] = b;
    imageData.data[3] = a;
    this.ctx.putImageData(imageData, x, y);
  }

  fillPixels(pixels: Array<{ x: number; y: number; r: number; g: number; b: number; a?: number }>): void {
    for (const p of pixels) {
      this.setPixel(p.x, p.y, p.r, p.g, p.b, p.a ?? 255);
    }
  }

  getAverageColor(): { r: number; g: number; b: number } {
    const imageData = this.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    let r = 0, g = 0, b = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return { r: r / count, g: g / count, b: b / count };
  }

  invert(): void {
    const imageData = this.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    this.putImageData(imageData, 0, 0);
  }

  grayscale(): void {
    const imageData = this.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    this.putImageData(imageData, 0, 0);
  }

  brightness(factor: number): void {
    const imageData = this.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * factor);
      data[i + 1] = Math.min(255, data[i + 1] * factor);
      data[i + 2] = Math.min(255, data[i + 2] * factor);
    }
    this.putImageData(imageData, 0, 0);
  }

  contrast(factor: number): void {
    const imageData = this.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    const intercept = 128 * (1 - factor);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept));
    }
    this.putImageData(imageData, 0, 0);
  }

  blur(radius: number = 1): void {
    this.ctx.filter = `blur(${radius}px)`;
    this.ctx.drawImage(this.canvas, 0, 0);
    this.ctx.filter = "none";
  }

  saturate(factor: number): void {
    this.ctx.filter = `saturate(${factor})`;
    this.ctx.drawImage(this.canvas, 0, 0);
    this.ctx.filter = "none";
  }

  hueRotate(degrees: number): void {
    this.ctx.filter = `hue-rotate(${degrees}deg)`;
    this.ctx.drawImage(this.canvas, 0, 0);
    this.ctx.filter = "none";
  }

  sepia(): void {
    this.ctx.filter = "sepia(1)";
    this.ctx.drawImage(this.canvas, 0, 0);
    this.ctx.filter = "none";
  }

  flipHorizontal(): void {
    this.ctx.save();
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.canvas, -this.width, 0);
    this.ctx.restore();
  }

  flipVertical(): void {
    this.ctx.save();
    this.ctx.scale(1, -1);
    this.ctx.drawImage(this.canvas, 0, -this.height);
    this.ctx.restore();
  }

  rotate2(degrees: number): void {
    const radians = (degrees * Math.PI) / 180;
    this.ctx.save();
    this.ctx.translate(this.width / 2, this.height / 2);
    this.ctx.rotate(radians);
    this.ctx.drawImage(this.canvas, -this.width / 2, -this.height / 2);
    this.ctx.restore();
  }

  crop(x: number, y: number, w: number, h: number): void {
    const imageData = this.getImageData(x, y, w, h);
    this.setSize(w, h);
    this.putImageData(imageData, 0, 0);
  }

  resize(newWidth: number, newHeight: number): void {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(this.canvas, 0, 0);
    this.setSize(newWidth, newHeight);
    this.ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
  }

  toJSON(): string {
    return JSON.stringify({ width: this.width, height: this.height }, null, 2);
  }
}

export function createCanvasUtils(canvas: HTMLCanvasElement, contextType?: "2d" | "webgl" | "webgl2"): CanvasUtils {
  return new CanvasUtils(canvas, contextType);
}
