/**
 * Feature flags -- toggle features on/off at runtime.
 * @module runtime/utils
 */

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  percentage?: number;
  userGroups?: string[];
  environments?: string[];
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagOptions {
  defaultEnabled?: boolean;
  environment?: string;
  userGroups?: string[];
  storageKey?: string;
  persist?: boolean;
}

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private options: Required<FeatureFlagOptions>;
  private handlers: Map<string, Set<(enabled: boolean) => void>> = new Map();
  private overrides: Map<string, boolean> = new Map();

  constructor(options: FeatureFlagOptions = {}) {
    this.options = {
      defaultEnabled: options.defaultEnabled ?? false,
      environment: options.environment ?? "development",
      userGroups: options.userGroups ?? [],
      storageKey: options.storageKey ?? "tw-feature-flags",
      persist: options.persist ?? true,
    };
    this.loadFromStorage();
  }

  register(name: string, flag: Partial<FeatureFlag> = {}): this {
    this.flags.set(name, {
      name,
      enabled: flag.enabled ?? this.options.defaultEnabled,
      description: flag.description,
      percentage: flag.percentage,
      userGroups: flag.userGroups,
      environments: flag.environments,
      expiresAt: flag.expiresAt,
      metadata: flag.metadata,
    });
    this.saveToStorage();
    return this;
  }

  unregister(name: string): this {
    this.flags.delete(name);
    this.overrides.delete(name);
    this.handlers.delete(name);
    this.saveToStorage();
    return this;
  }

  isEnabled(name: string): boolean {
    if (this.overrides.has(name)) {
      return this.overrides.get(name)!;
    }
    const flag = this.flags.get(name);
    if (!flag) return false;
    if (flag.expiresAt && Date.now() > flag.expiresAt) {
      return false;
    }
    if (flag.environments && !flag.environments.includes(this.options.environment)) {
      return false;
    }
    if (flag.userGroups && flag.userGroups.length > 0) {
      const hasGroup = flag.userGroups.some((g) => this.options.userGroups.includes(g));
      if (!hasGroup) return false;
    }
    if (flag.percentage !== undefined && flag.percentage < 100) {
      const hash = this.hashString(name);
      return (hash % 100) < flag.percentage;
    }
    return flag.enabled;
  }

  isDisabled(name: string): boolean {
    return !this.isEnabled(name);
  }

  enable(name: string): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.enabled = true;
      this.notifyChange(name, true);
      this.saveToStorage();
    }
    return this;
  }

  disable(name: string): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.enabled = false;
      this.notifyChange(name, false);
      this.saveToStorage();
    }
    return this;
  }

  toggle(name: string): boolean {
    if (this.isEnabled(name)) {
      this.disable(name);
      return false;
    } else {
      this.enable(name);
      return true;
    }
  }

  setOverride(name: string, enabled: boolean): this {
    this.overrides.set(name, enabled);
    this.notifyChange(name, enabled);
    return this;
  }

  clearOverride(name: string): this {
    this.overrides.delete(name);
    const flag = this.flags.get(name);
    if (flag) {
      this.notifyChange(name, flag.enabled);
    }
    return this;
  }

  clearAllOverrides(): this {
    this.overrides.clear();
    return this;
  }

  hasOverride(name: string): boolean {
    return this.overrides.has(name);
  }

  getFlag(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  getAllFlags(): FeatureFlag[] {
    return [...this.flags.values()];
  }

  getEnabledFlags(): string[] {
    return [...this.flags.keys()].filter((name) => this.isEnabled(name));
  }

  getDisabledFlags(): string[] {
    return [...this.flags.keys()].filter((name) => !this.isEnabled(name));
  }

  hasFlag(name: string): boolean {
    return this.flags.has(name);
  }

  setDescription(name: string, description: string): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.description = description;
      this.saveToStorage();
    }
    return this;
  }

  getDescription(name: string): string | undefined {
    return this.flags.get(name)?.description;
  }

  setPercentage(name: string, percentage: number): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.percentage = Math.max(0, Math.min(100, percentage));
      this.saveToStorage();
    }
    return this;
  }

  getPercentage(name: string): number | undefined {
    return this.flags.get(name)?.percentage;
  }

  setUserGroups(name: string, groups: string[]): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.userGroups = groups;
      this.saveToStorage();
    }
    return this;
  }

  getUserGroups(name: string): string[] | undefined {
    return this.flags.get(name)?.userGroups;
  }

  setEnvironments(name: string, environments: string[]): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.environments = environments;
      this.saveToStorage();
    }
    return this;
  }

  getEnvironments(name: string): string[] | undefined {
    return this.flags.get(name)?.environments;
  }

  setExpiry(name: string, timestamp: number): this {
    const flag = this.flags.get(name);
    if (flag) {
      flag.expiresAt = timestamp;
      this.saveToStorage();
    }
    return this;
  }

  getExpiry(name: string): number | undefined {
    return this.flags.get(name)?.expiresAt;
  }

  isExpired(name: string): boolean {
    const flag = this.flags.get(name);
    if (!flag?.expiresAt) return false;
    return Date.now() > flag.expiresAt;
  }

  setMetadata(name: string, key: string, value: unknown): this {
    const flag = this.flags.get(name);
    if (flag) {
      if (!flag.metadata) flag.metadata = {};
      flag.metadata[key] = value;
      this.saveToStorage();
    }
    return this;
  }

  getMetadata(name: string, key: string): unknown {
    return this.flags.get(name)?.metadata?.[key];
  }

  getAllMetadata(name: string): Record<string, unknown> | undefined {
    return this.flags.get(name)?.metadata;
  }

  onChange(name: string, handler: (enabled: boolean) => void): () => void {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, new Set());
    }
    this.handlers.get(name)!.add(handler);
    return () => {
      this.handlers.get(name)?.delete(handler);
    };
  }

  private notifyChange(name: string, enabled: boolean): void {
    this.handlers.get(name)?.forEach((handler) => handler(enabled));
  }

  setEnvironment(env: string): this {
    this.options.environment = env;
    this.saveToStorage();
    return this;
  }

  getEnvironment(): string {
    return this.options.environment;
  }

  setUserGroups2(groups: string[]): this {
    this.options.userGroups = groups;
    this.saveToStorage();
    return this;
  }

  getUserGroups2(): string[] {
    return [...this.options.userGroups];
  }

  addUserGroup(group: string): this {
    if (!this.options.userGroups.includes(group)) {
      this.options.userGroups.push(group);
      this.saveToStorage();
    }
    return this;
  }

  removeUserGroup(group: string): this {
    this.options.userGroups = this.options.userGroups.filter((g) => g !== group);
    this.saveToStorage();
    return this;
  }

  hasUserGroup(group: string): boolean {
    return this.options.userGroups.includes(group);
  }

  getFlagCount(): number {
    return this.flags.size;
  }

  getEnabledCount(): number {
    return this.getEnabledFlags().length;
  }

  getDisabledCount(): number {
    return this.getDisabledFlags().length;
  }

  getOverrideCount(): number {
    return this.overrides.size;
  }

  clear(): this {
    this.flags.clear();
    this.overrides.clear();
    this.handlers.clear();
    this.saveToStorage();
    return this;
  }

  private saveToStorage(): void {
    if (!this.options.persist) return;
    if (typeof localStorage === "undefined") return;
    try {
      const data = JSON.stringify([...this.flags.values()]);
      localStorage.setItem(this.options.storageKey, data);
    } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
  }

  private loadFromStorage(): void {
    if (!this.options.persist) return;
    if (typeof localStorage === "undefined") return;
    try {
      const data = localStorage.getItem(this.options.storageKey);
      if (data) {
        const flags = JSON.parse(data) as FeatureFlag[];
        for (const flag of flags) {
          this.flags.set(flag.name, flag);
        }
      }
    } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
  }

  clearStorage(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(this.options.storageKey);
    }
  }

  exportConfig(): string {
    return JSON.stringify({
      flags: [...this.flags.values()],
      overrides: [...this.overrides.entries()],
      options: this.options,
    }, null, 2);
  }

  importConfig(config: string): this {
    try {
      const data = JSON.parse(config);
      this.flags.clear();
      this.overrides.clear();
      for (const flag of data.flags ?? []) {
        this.flags.set(flag.name, flag);
      }
      for (const [name, enabled] of data.overrides ?? []) {
        this.overrides.set(name, enabled);
      }
      this.saveToStorage();
    } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
    return this;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  toJSON(): string {
    return JSON.stringify({
      flags: this.getFlagCount(),
      enabled: this.getEnabledCount(),
      disabled: this.getDisabledCount(),
      overrides: this.getOverrideCount(),
      environment: this.options.environment,
    }, null, 2);
  }
}

export function createFeatureFlagManager(options?: FeatureFlagOptions): FeatureFlagManager {
  return new FeatureFlagManager(options);
}

export class EnvironmentManager {
  private variables: Map<string, string> = new Map();
  private environment: string = "development";

  constructor(environment: string = "development") {
    this.environment = environment;
    this.loadDefaults();
  }

  private loadDefaults(): void {
    this.variables.set("NODE_ENV", this.environment);
    this.variables.set("TW_ENV", this.environment);
    if (typeof process !== "undefined" && process.env) {
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          this.variables.set(key, value);
        }
      }
    }
  }

  get(key: string): string | undefined {
    return this.variables.get(key);
  }

  set(key: string, value: string): this {
    this.variables.set(key, value);
    return this;
  }

  has(key: string): boolean {
    return this.variables.has(key);
  }

  remove(key: string): this {
    this.variables.delete(key);
    return this;
  }

  clear(): this {
    this.variables.clear();
    return this;
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this.variables);
  }

  keys(): string[] {
    return [...this.variables.keys()];
  }

  values(): string[] {
    return [...this.variables.values()];
  }

  getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  getInteger(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }

  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    return value === "true" || value === "1" || value === "yes" || value === "on";
  }

  getJSON<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  getString(key: string, defaultValue?: string): string | undefined {
    return this.get(key) ?? defaultValue;
  }

  getEnvironment(): string {
    return this.environment;
  }

  setEnvironment(env: string): this {
    this.environment = env;
    this.variables.set("NODE_ENV", env);
    this.variables.set("TW_ENV", env);
    return this;
  }

  isDevelopment(): boolean {
    return this.environment === "development";
  }

  isProduction(): boolean {
    return this.environment === "production";
  }

  isTest(): boolean {
    return this.environment === "test";
  }

  isStaging(): boolean {
    return this.environment === "staging";
  }

  loadFile(filePath: string): this {
    return this;
  }

  loadObject(obj: Record<string, string>): this {
    for (const [key, value] of Object.entries(obj)) {
      this.variables.set(key, value);
    }
    return this;
  }

  expand(value: string): string {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => this.get(name) ?? "");
  }

  size(): number {
    return this.variables.size;
  }

  toJSON(): string {
    return JSON.stringify({
      environment: this.environment,
      variables: this.size(),
    }, null, 2);
  }
}

export function createEnvironmentManager(environment?: string): EnvironmentManager {
  return new EnvironmentManager(environment);
}

export class DependencyInjector {
  private services: Map<string, { instance: unknown; factory?: () => unknown; singleton: boolean; dependencies: string[] }> = new Map();
  private resolving: Set<string> = new Set();

  register<T>(name: string, factory: () => T, options: { singleton?: boolean; dependencies?: string[] } = {}): this {
    this.services.set(name, {
      instance: undefined,
      factory: factory as () => unknown,
      singleton: options.singleton ?? true,
      dependencies: options.dependencies ?? [],
    });
    return this;
  }

  registerInstance<T>(name: string, instance: T): this {
    this.services.set(name, {
      instance,
      factory: undefined,
      singleton: true,
      dependencies: [],
    });
    return this;
  }

  registerSingleton<T>(name: string, factory: () => T, dependencies?: string[]): this {
    return this.register(name, factory, { singleton: true, dependencies });
  }

  registerTransient<T>(name: string, factory: () => T, dependencies?: string[]): this {
    return this.register(name, factory, { singleton: false, dependencies });
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not registered`);
    }
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected for "${name}"`);
    }
    if (service.singleton && service.instance !== undefined) {
      return service.instance as T;
    }
    if (!service.factory) {
      return service.instance as T;
    }
    this.resolving.add(name);
    const dependencies: Record<string, unknown> = {};
    for (const dep of service.dependencies) {
      dependencies[dep] = this.resolve(dep);
    }
    const instance = service.factory();
    if (service.singleton) {
      service.instance = instance;
    }
    this.resolving.delete(name);
    return instance as T;
  }

  tryResolve<T>(name: string): T | undefined {
    try {
      return this.resolve<T>(name);
    } catch {
      return undefined;
    }
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  unregister(name: string): this {
    this.services.delete(name);
    return this;
  }

  clear(): this {
    this.services.clear();
    this.resolving.clear();
    return this;
  }

  getRegisteredServices(): string[] {
    return [...this.services.keys()];
  }

  getServiceCount(): number {
    return this.services.size;
  }

  getDependencies(name: string): string[] {
    return this.services.get(name)?.dependencies ?? [];
  }

  isSingleton(name: string): boolean {
    return this.services.get(name)?.singleton ?? false;
  }

  isTransient(name: string): boolean {
    return !this.isSingleton(name);
  }

  isRegistered(name: string): boolean {
    return this.has(name);
  }

  hasCircularDependency(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    for (const name of this.services.keys()) {
      if (this.hasCycle(name, visited, recursionStack)) {
        return true;
      }
    }
    return false;
  }

  private hasCycle(name: string, visited: Set<string>, recursionStack: Set<string>): boolean {
    if (recursionStack.has(name)) return true;
    if (visited.has(name)) return false;
    visited.add(name);
    recursionStack.add(name);
    const deps = this.getDependencies(name);
    for (const dep of deps) {
      if (this.hasCycle(dep, visited, recursionStack)) return true;
    }
    recursionStack.delete(name);
    return false;
  }

  getCircularDependencies(): string[] {
    const cycles: string[] = [];
    const visited = new Set<string>();
    for (const name of this.services.keys()) {
      const path: string[] = [];
      this.findCycles(name, visited, path, cycles);
    }
    return [...new Set(cycles)];
  }

  private findCycles(name: string, visited: Set<string>, path: string[], cycles: string[]): void {
    if (path.includes(name)) {
      const cycleStart = path.indexOf(name);
      for (const n of path.slice(cycleStart)) {
        cycles.push(n);
      }
      cycles.push(name);
      return;
    }
    if (visited.has(name)) return;
    visited.add(name);
    path.push(name);
    for (const dep of this.getDependencies(name)) {
      this.findCycles(dep, visited, path, cycles);
    }
    path.pop();
  }

  getDependencyTree(name: string): { name: string; dependencies: unknown[] } {
    const build = (n: string, visited: Set<string>): { name: string; dependencies: unknown[] } => {
      if (visited.has(n)) {
        return { name: n, dependencies: [] };
      }
      visited.add(n);
      const deps = this.getDependencies(n);
      return {
        name: n,
        dependencies: deps.map((d) => build(d, visited)),
      };
    };
    return build(name, new Set());
  }

  resolveAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.services.keys()) {
      result[name] = this.resolve(name);
    }
    return result;
  }

  createChild(): DependencyInjector {
    const child = new DependencyInjector();
    for (const [name, service] of this.services) {
      child.services.set(name, { ...service });
    }
    return child;
  }

  toJSON(): string {
    return JSON.stringify({
      services: this.getRegisteredServices(),
      count: this.getServiceCount(),
      hasCircular: this.hasCircularDependency(),
    }, null, 2);
  }
}

export function createDependencyInjector(): DependencyInjector {
  return new DependencyInjector();
}
