/**
 * Internationalization -- translations, formatting, locale management.
 * @module runtime/i18n
 */

export type Locale = string;

export interface TranslationEntry {
  key: string;
  value: string;
  params?: Record<string, unknown>;
  plural?: number;
}

export interface TranslationMessages {
  [key: string]: string | TranslationMessages;
}

export interface LocaleConfig {
  code: Locale;
  name: string;
  messages: TranslationMessages;
  pluralRule?: (n: number) => number;
  numberFormat?: Intl.NumberFormatOptions;
  dateFormat?: Intl.DateTimeFormatOptions;
  timeFormat?: Intl.DateTimeFormatOptions;
  currency?: string;
  direction?: "ltr" | "rtl";
  fallback?: Locale;
}

export interface I18nOptions {
  defaultLocale?: Locale;
  fallbackLocale?: Locale;
  locales?: LocaleConfig[];
  lazy?: boolean;
  cache?: boolean;
  warnOnMissing?: boolean;
  interpolation?: { prefix?: string; suffix?: string };
}

const DEFAULT_OPTIONS: Required<I18nOptions> = {
  defaultLocale: "en",
  fallbackLocale: "en",
  locales: [],
  lazy: false,
  cache: true,
  warnOnMissing: true,
  interpolation: { prefix: "{", suffix: "}" },
};

export class I18nManager {
  private currentLocale: Locale;
  private fallbackLocale: Locale;
  private locales: Map<Locale, LocaleConfig> = new Map();
  private messages: Map<Locale, TranslationMessages> = new Map();
  private cache: Map<string, string> = new Map();
  private options: Required<I18nOptions>;
  private loadedLocales: Set<Locale> = new Set();
  private loadHandlers: Map<Locale, () => Promise<TranslationMessages>> = new Map();
  private changeHandlers: Array<(locale: Locale) => void> = [];

  constructor(options: I18nOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.currentLocale = this.options.defaultLocale;
    this.fallbackLocale = this.options.fallbackLocale;
    for (const localeConfig of this.options.locales) {
      this.registerLocale(localeConfig);
    }
    if (this.locales.has(this.currentLocale)) {
      this.loadedLocales.add(this.currentLocale);
    }
    if (this.locales.has(this.fallbackLocale)) {
      this.loadedLocales.add(this.fallbackLocale);
    }
  }

  registerLocale(config: LocaleConfig): this {
    this.locales.set(config.code, config);
    this.messages.set(config.code, config.messages);
    this.loadedLocales.add(config.code);
    return this;
  }

  unregisterLocale(code: Locale): this {
    this.locales.delete(code);
    this.messages.delete(code);
    this.loadedLocales.delete(code);
    this.cache.clear();
    return this;
  }

  setLocale(code: Locale): Promise<void> {
    if (this.currentLocale === code) return Promise.resolve();
    if (!this.locales.has(code)) {
      return Promise.reject(new Error(`Locale "${code}" not registered`));
    }
    this.currentLocale = code;
    this.cache.clear();
    if (this.options.lazy && !this.loadedLocales.has(code)) {
      const loader = this.loadHandlers.get(code);
      if (loader) {
        return loader().then((messages) => {
          this.messages.set(code, messages);
          this.loadedLocales.add(code);
          this.notifyChange();
        });
      }
    }
    this.loadedLocales.add(code);
    this.notifyChange();
    return Promise.resolve();
  }

  getLocale(): Locale {
    return this.currentLocale;
  }

  getFallbackLocale(): Locale {
    return this.fallbackLocale;
  }

  setFallbackLocale(code: Locale): void {
    this.fallbackLocale = code;
  }

  getRegisteredLocales(): Locale[] {
    return [...this.locales.keys()];
  }

  hasLocale(code: Locale): boolean {
    return this.locales.has(code);
  }

  isLocaleLoaded(code: Locale): boolean {
    return this.loadedLocales.has(code);
  }

  registerLazyLoader(code: Locale, loader: () => Promise<TranslationMessages>): void {
    this.loadHandlers.set(code, loader);
  }

  async loadLocale(code: Locale): Promise<void> {
    const loader = this.loadHandlers.get(code);
    if (loader && !this.loadedLocales.has(code)) {
      const messages = await loader();
      this.messages.set(code, messages);
      this.loadedLocales.add(code);
    }
  }

  translate(key: string, params?: Record<string, unknown>, count?: number): string {
    const cacheKey = `${this.currentLocale}:${key}:${JSON.stringify(params ?? {})}:${count ?? ""}`;
    if (this.options.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    let message = this.getMessage(this.currentLocale, key);
    if (message === undefined) {
      message = this.getMessage(this.fallbackLocale, key);
      if (message === undefined) {
        if (this.options.warnOnMissing) {
          console.warn(`Missing translation: ${key} for locale ${this.currentLocale}`);
        }
        return key;
      }
    }
    if (count !== undefined && typeof message === "string") {
      message = this.applyPluralization(this.currentLocale, message, count);
    }
    if (params) {
      message = this.interpolate(message as string, params);
    }
    if (this.options.cache) {
      this.cache.set(cacheKey, message as string);
    }
    return message as string;
  }

  t(key: string, params?: Record<string, unknown>, count?: number): string {
    return this.translate(key, params, count);
  }

  private getMessage(locale: Locale, key: string): string | TranslationMessages | undefined {
    const messages = this.messages.get(locale);
    if (!messages) return undefined;
    const parts = key.split(".");
    let current: string | TranslationMessages | undefined = messages;
    for (const part of parts) {
      if (typeof current === "string" || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  private applyPluralization(locale: Locale, message: string, count: number): string {
    const config = this.locales.get(locale);
    if (!config?.pluralRule) return message;
    const pluralIndex = config.pluralRule(count);
    const variants = message.split("|").map((v) => v.trim());
    return variants[pluralIndex] ?? message;
  }

  private interpolate(message: string, params: Record<string, unknown>): string {
    const { prefix, suffix } = this.options.interpolation;
    let result = message;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `${prefix}${key}${suffix}`;
      result = result.split(placeholder).join(String(value));
    }
    return result;
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { ...config?.numberFormat, ...options };
    return new Intl.NumberFormat(this.currentLocale, mergedOptions as any).format(value);
  }

  formatCurrency(value: number, currency?: string, options?: Intl.NumberFormatOptions): string {
    const config = this.locales.get(this.currentLocale);
    const cur = currency ?? config?.currency ?? "USD";
    const mergedOptions = { style: "currency", currency: cur, ...config?.numberFormat, ...options };
    return new Intl.NumberFormat(this.currentLocale, mergedOptions as any).format(value);
  }

  formatDate(date: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { ...config?.dateFormat, ...options };
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(this.currentLocale, mergedOptions as any).format(dateObj);
  }

  formatTime(date: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { hour: "2-digit", minute: "2-digit", ...config?.timeFormat, ...options };
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(this.currentLocale, mergedOptions as any).format(dateObj);
  }

  formatDateTime(date: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    const config = this.locales.get(this.currentLocale);
    const mergedOptions = { ...config?.dateFormat, ...config?.timeFormat, ...options };
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(this.currentLocale, mergedOptions as any).format(dateObj);
  }

  formatRelativeTime(date: Date | number | string, options?: Intl.RelativeTimeFormatOptions): string {
    const dateObj = date instanceof Date ? date : new Date(date);
    const diff = dateObj.getTime() - Date.now();
    const seconds = Math.round(diff / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const rtf = new Intl.RelativeTimeFormat(this.currentLocale, options);
    if (Math.abs(seconds) < 60) return rtf.format(seconds, "second");
    if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(days, "day");
  }

  formatList(items: string[], options?: Intl.ListFormatOptions): string {
    return new Intl.ListFormat(this.currentLocale, options).format(items);
  }

  formatPlural(n: number, options?: Intl.PluralRulesOptions): string {
    return new Intl.PluralRules(this.currentLocale, options).select(n);
  }

  getDirection(): "ltr" | "rtl" {
    return this.locales.get(this.currentLocale)?.direction ?? "ltr";
  }

  isRTL(): boolean {
    return this.getDirection() === "rtl";
  }

  getCurrency(): string {
    return this.locales.get(this.currentLocale)?.currency ?? "USD";
  }

  getLocaleName(): string {
    return this.locales.get(this.currentLocale)?.name ?? this.currentLocale;
  }

  getLocaleConfig(code?: Locale): LocaleConfig | undefined {
    return this.locales.get(code ?? this.currentLocale);
  }

  onLocaleChange(handler: (locale: Locale) => void): () => void {
    this.changeHandlers.push(handler);
    return () => {
      const index = this.changeHandlers.indexOf(handler);
      if (index !== -1) this.changeHandlers.splice(index, 1);
    };
  }

  private notifyChange(): void {
    this.changeHandlers.forEach((handler) => handler(this.currentLocale));
  }

  getMessages(locale?: Locale): TranslationMessages | undefined {
    return this.messages.get(locale ?? this.currentLocale);
  }

  setMessages(locale: Locale, messages: TranslationMessages): void {
    this.messages.set(locale, messages);
    this.loadedLocales.add(locale);
    this.cache.clear();
  }

  addMessages(locale: Locale, messages: TranslationMessages): void {
    const existing = this.messages.get(locale) ?? {};
    this.messages.set(locale, this.mergeMessages(existing, messages));
    this.cache.clear();
  }

  private mergeMessages(base: TranslationMessages, override: TranslationMessages): TranslationMessages {
    const result: TranslationMessages = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (typeof value === "object" && value !== null && typeof result[key] === "object" && result[key] !== null) {
        result[key] = this.mergeMessages(result[key] as TranslationMessages, value as TranslationMessages);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  hasTranslation(key: string, locale?: Locale): boolean {
    return this.getMessage(locale ?? this.currentLocale, key) !== undefined;
  }

  getMissingTranslations(locale: Locale): string[] {
    const currentMessages = this.messages.get(locale);
    const fallbackMessages = this.messages.get(this.fallbackLocale);
    if (!currentMessages || !fallbackMessages) return [];
    const missing: string[] = [];
    this.collectMissingKeys(fallbackMessages, currentMessages, "", missing);
    return missing;
  }

  private collectMissingKeys(source: TranslationMessages, target: TranslationMessages, prefix: string, missing: string[]): void {
    for (const [key, value] of Object.entries(source)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        if (target[key] === undefined) {
          missing.push(fullKey);
        }
      } else if (typeof value === "object" && value !== null) {
        this.collectMissingKeys(value, (target[key] as TranslationMessages) ?? {}, fullKey, missing);
      }
    }
  }

  getTranslationProgress(locale: Locale): number {
    const fallbackMessages = this.messages.get(this.fallbackLocale);
    const localeMessages = this.messages.get(locale);
    if (!fallbackMessages || !localeMessages) return 0;
    const totalKeys = this.countKeys(fallbackMessages);
    const translatedKeys = this.countKeys(localeMessages);
    return totalKeys > 0 ? (translatedKeys / totalKeys) * 100 : 0;
  }

  private countKeys(messages: TranslationMessages): number {
    let count = 0;
    for (const value of Object.values(messages)) {
      if (typeof value === "string") {
        count++;
      } else if (typeof value === "object" && value !== null) {
        count += this.countKeys(value);
      }
    }
    return count;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getOptions(): Required<I18nOptions> {
    return { ...this.options };
  }

  setOptions(options: Partial<I18nOptions>): void {
    this.options = { ...this.options, ...options };
  }

  toJSON(): string {
    return JSON.stringify({
      currentLocale: this.currentLocale,
      fallbackLocale: this.fallbackLocale,
      locales: [...this.locales.keys()],
      loadedLocales: [...this.loadedLocales],
      cacheSize: this.cache.size,
    }, null, 2);
  }
}

export function createI18n(options?: I18nOptions): I18nManager {
  return new I18nManager(options);
}

export class ThemeManager {
  private currentTheme: string = "light";
  private themes: Map<string, Record<string, string>> = new Map();
  private storageKey: string = "tw-theme";
  private useSystemPreference: boolean = true;
  private systemTheme: "light" | "dark" = "light";
  private mediaQuery: MediaQueryList | null = null;
  private changeHandlers: Array<(theme: string) => void> = [];

  constructor(options: { defaultTheme?: string; storageKey?: string; useSystemPreference?: boolean; themes?: Array<{ name: string; values: Record<string, string> }> } = {}) {
    this.currentTheme = options.defaultTheme ?? "light";
    this.storageKey = options.storageKey ?? "tw-theme";
    this.useSystemPreference = options.useSystemPreference ?? true;
    for (const theme of options.themes ?? []) {
      this.registerTheme(theme.name, theme.values);
    }
    this.loadSavedTheme();
    if (this.useSystemPreference) {
      this.setupSystemPreference();
    }
  }

  registerTheme(name: string, values: Record<string, string>): this {
    this.themes.set(name, values);
    return this;
  }

  unregisterTheme(name: string): this {
    this.themes.delete(name);
    return this;
  }

  setTheme(name: string): void {
    if (!this.themes.has(name)) {
      throw new Error(`Theme "${name}" not registered`);
    }
    this.currentTheme = name;
    this.applyTheme(name);
    this.saveTheme(name);
    this.notifyChange(name);
  }

  getTheme(): string {
    return this.currentTheme;
  }

  getThemes(): string[] {
    return [...this.themes.keys()];
  }

  hasTheme(name: string): boolean {
    return this.themes.has(name);
  }

  getThemeValues(name: string): Record<string, string> | undefined {
    return this.themes.get(name);
  }

  toggleTheme(): void {
    if (this.currentTheme === "light") {
      this.setTheme("dark");
    } else {
      this.setTheme("light");
    }
  }

  toggle(): void {
    this.toggleTheme();
  }

  isDark(): boolean {
    return this.currentTheme === "dark";
  }

  isLight(): boolean {
    return this.currentTheme === "light";
  }

  private applyTheme(name: string): void {
    const values = this.themes.get(name);
    if (!values) return;
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      for (const [key, value] of Object.entries(values)) {
        root.style.setProperty(key, value);
      }
      root.setAttribute("data-theme", name);
    }
  }

  private loadSavedTheme(): void {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(this.storageKey);
      if (saved && this.themes.has(saved)) {
        this.currentTheme = saved;
        this.applyTheme(saved);
      }
    }
  }

  private saveTheme(name: string): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.storageKey, name);
    }
  }

  private setupSystemPreference(): void {
    if (typeof window !== "undefined" && window.matchMedia) {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.systemTheme = this.mediaQuery.matches ? "dark" : "light";
      this.mediaQuery.addEventListener("change", (e) => {
        this.systemTheme = e.matches ? "dark" : "light";
        if (this.useSystemPreference) {
          this.setTheme(this.systemTheme);
        }
      });
    }
  }

  getSystemTheme(): "light" | "dark" {
    return this.systemTheme;
  }

  setUseSystemPreference(use: boolean): void {
    this.useSystemPreference = use;
    if (use) {
      this.setTheme(this.systemTheme);
    }
  }

  onThemeChange(handler: (theme: string) => void): () => void {
    this.changeHandlers.push(handler);
    return () => {
      const index = this.changeHandlers.indexOf(handler);
      if (index !== -1) this.changeHandlers.splice(index, 1);
    };
  }

  private notifyChange(theme: string): void {
    this.changeHandlers.forEach((handler) => handler(theme));
  }

  clearSavedTheme(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(this.storageKey);
    }
  }

  getStorageKey(): string {
    return this.storageKey;
  }

  setStorageKey(key: string): void {
    this.storageKey = key;
  }

  getThemeCount(): number {
    return this.themes.size;
  }

  toJSON(): string {
    return JSON.stringify({
      currentTheme: this.currentTheme,
      themes: this.getThemes(),
      systemTheme: this.systemTheme,
      useSystemPreference: this.useSystemPreference,
    }, null, 2);
  }
}

export function createThemeManager(options?: { defaultTheme?: string; storageKey?: string; useSystemPreference?: boolean; themes?: Array<{ name: string; values: Record<string, string> }> }): ThemeManager {
  return new ThemeManager(options);
}

export class FormValidator {
  private rules: Map<string, ValidationRule[]> = new Map();
  private messages: Map<string, string> = new Map();
  private customValidators: Map<string, (value: unknown, params?: unknown) => boolean | string> = new Map();

  registerRule(field: string, rule: ValidationRule): this {
    if (!this.rules.has(field)) {
      this.rules.set(field, []);
    }
    this.rules.get(field)!.push(rule);
    return this;
  }

  registerCustomValidator(name: string, validator: (value: unknown, params?: unknown) => boolean | string): this {
    this.customValidators.set(name, validator);
    return this;
  }

  setMessage(key: string, message: string): this {
    this.messages.set(key, message);
    return this;
  }

  validate(data: Record<string, unknown>): { valid: boolean; errors: Record<string, string[]> } {
    const errors: Record<string, string[]> = {};
    for (const [field, rules] of this.rules) {
      const value = data[field];
      for (const rule of rules) {
        const error = this.validateRule(field, value, rule, data);
        if (error) {
          if (!errors[field]) errors[field] = [];
          errors[field].push(error);
        }
      }
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  validateField(field: string, value: unknown, allData?: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const rules = this.rules.get(field) ?? [];
    const errors: string[] = [];
    for (const rule of rules) {
      const error = this.validateRule(field, value, rule, allData ?? {});
      if (error) errors.push(error);
    }
    return { valid: errors.length === 0, errors };
  }

  private validateRule(field: string, value: unknown, rule: ValidationRule, data: Record<string, unknown>): string | null {
    switch (rule.type) {
      case "required":
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
          return this.getMessage(field, "required", `${field} is required`);
        }
        break;
      case "minLength":
        if (typeof value === "string" && value.length < (rule.params as number)) {
          return this.getMessage(field, "minLength", `${field} must be at least ${rule.params} characters`);
        }
        break;
      case "maxLength":
        if (typeof value === "string" && value.length > (rule.params as number)) {
          return this.getMessage(field, "maxLength", `${field} must be at most ${rule.params} characters`);
        }
        break;
      case "min":
        if (typeof value === "number" && value < (rule.params as number)) {
          return this.getMessage(field, "min", `${field} must be at least ${rule.params}`);
        }
        break;
      case "max":
        if (typeof value === "number" && value > (rule.params as number)) {
          return this.getMessage(field, "max", `${field} must be at most ${rule.params}`);
        }
        break;
      case "email":
        if (typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return this.getMessage(field, "email", `${field} must be a valid email`);
        }
        break;
      case "url":
        if (typeof value === "string" && value && !/^https?:\/\/.+/.test(value)) {
          return this.getMessage(field, "url", `${field} must be a valid URL`);
        }
        break;
      case "pattern":
        if (typeof value === "string" && value && !(rule.params as RegExp).test(value)) {
          return this.getMessage(field, "pattern", `${field} format is invalid`);
        }
        break;
      case "number":
        if (value !== undefined && value !== null && value !== "" && isNaN(Number(value))) {
          return this.getMessage(field, "number", `${field} must be a number`);
        }
        break;
      case "integer":
        if (value !== undefined && value !== null && value !== "" && !Number.isInteger(Number(value))) {
          return this.getMessage(field, "integer", `${field} must be an integer`);
        }
        break;
      case "boolean":
        if (value !== undefined && value !== null && typeof value !== "boolean") {
          return this.getMessage(field, "boolean", `${field} must be a boolean`);
        }
        break;
      case "date":
        if (typeof value === "string" && value && isNaN(Date.parse(value))) {
          return this.getMessage(field, "date", `${field} must be a valid date`);
        }
        break;
      case "oneOf":
        if (!Array.isArray(rule.params) || !rule.params.includes(value)) {
          return this.getMessage(field, "oneOf", `${field} must be one of: ${(rule.params as unknown[]).join(", ")}`);
        }
        break;
      case "noneOf":
        if (Array.isArray(rule.params) && rule.params.includes(value)) {
          return this.getMessage(field, "noneOf", `${field} must not be one of: ${(rule.params as unknown[]).join(", ")}`);
        }
        break;
      case "sameAs":
        if (value !== data[rule.params as string]) {
          return this.getMessage(field, "sameAs", `${field} must match ${rule.params}`);
        }
        break;
      case "differentFrom":
        if (value === data[rule.params as string]) {
          return this.getMessage(field, "differentFrom", `${field} must be different from ${rule.params}`);
        }
        break;
      case "custom":
        const validator = this.customValidators.get(rule.params as string);
        if (validator) {
          const result = validator(value, rule.options);
          if (result !== true) {
            return typeof result === "string" ? result : this.getMessage(field, "custom", `${field} is invalid`);
          }
        }
        break;
    }
    return null;
  }

  private getMessage(field: string, ruleType: string, defaultMsg: string): string {
    return this.messages.get(`${field}.${ruleType}`) ?? this.messages.get(ruleType) ?? defaultMsg;
  }

  getRules(field?: string): ValidationRule[] {
    return field ? this.rules.get(field) ?? [] : [...this.rules.values()].flat();
  }

  getRegisteredFields(): string[] {
    return [...this.rules.keys()];
  }

  hasRules(field: string): boolean {
    return this.rules.has(field);
  }

  clearRules(field?: string): void {
    if (field) {
      this.rules.delete(field);
    } else {
      this.rules.clear();
    }
  }

  clearMessages(): void {
    this.messages.clear();
  }

  clearAll(): void {
    this.rules.clear();
    this.messages.clear();
    this.customValidators.clear();
  }
}

export interface ValidationRule {
  type: "required" | "minLength" | "maxLength" | "min" | "max" | "email" | "url" | "pattern" | "number" | "integer" | "boolean" | "date" | "oneOf" | "noneOf" | "sameAs" | "differentFrom" | "custom";
  params?: unknown;
  options?: unknown;
}

export function createFormValidator(): FormValidator {
  return new FormValidator();
}

export class DragDropManager {
  private draggables: Map<string, HTMLElement> = new Map();
  private dropZones: Map<string, HTMLElement> = new Map();
  private draggedElement: HTMLElement | null = null;
  private draggedId: string | null = null;
  private draggedData: unknown = null;
  private hoverElement: HTMLElement | null = null;
  private handlers: Map<string, Map<string, Set<(...args: any[]) => void>>> = new Map();

  registerDraggable(id: string, element: HTMLElement, data?: unknown): () => void {
    this.draggables.set(id, element);
    const dragStartHandler = (e: DragEvent) => {
      this.draggedElement = element;
      this.draggedId = id;
      this.draggedData = data;
      e.dataTransfer?.setData("text/plain", id);
      this.emit("dragstart", id, element, data);
    };
    const dragEndHandler = () => {
      this.draggedElement = null;
      this.draggedId = null;
      this.draggedData = null;
      this.hoverElement = null;
      this.emit("dragend", id, element, data);
    };
    element.draggable = true;
    element.addEventListener("dragstart", dragStartHandler);
    element.addEventListener("dragend", dragEndHandler);
    return () => {
      element.removeEventListener("dragstart", dragStartHandler);
      element.removeEventListener("dragend", dragEndHandler);
      this.draggables.delete(id);
    };
  }

  registerDropZone(id: string, element: HTMLElement): () => void {
    this.dropZones.set(id, element);
    const dragOverHandler = (e: DragEvent) => {
      e.preventDefault();
      this.hoverElement = element;
      this.emit("dragover", id, element, this.draggedId, this.draggedData);
    };
    const dragEnterHandler = (e: DragEvent) => {
      e.preventDefault();
      this.emit("dragenter", id, element, this.draggedId, this.draggedData);
    };
    const dragLeaveHandler = () => {
      this.emit("dragleave", id, element, this.draggedId, this.draggedData);
    };
    const dropHandler = (e: DragEvent) => {
      e.preventDefault();
      this.emit("drop", id, element, this.draggedId, this.draggedData);
      this.hoverElement = null;
    };
    element.addEventListener("dragover", dragOverHandler);
    element.addEventListener("dragenter", dragEnterHandler);
    element.addEventListener("dragleave", dragLeaveHandler);
    element.addEventListener("drop", dropHandler);
    return () => {
      element.removeEventListener("dragover", dragOverHandler);
      element.removeEventListener("dragenter", dragEnterHandler);
      element.removeEventListener("dragleave", dragLeaveHandler);
      element.removeEventListener("drop", dropHandler);
      this.dropZones.delete(id);
    };
  }

  on(event: string, zoneId: string, handler: (...args: any[]) => void): () => void {
    const key = `${event}:${zoneId}`;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Map());
    }
    if (!this.handlers.get(key)!.has(zoneId)) {
      this.handlers.get(key)!.set(zoneId, new Set());
    }
    this.handlers.get(key)!.get(zoneId)!.add(handler);
    return () => {
      this.handlers.get(key)?.get(zoneId)?.delete(handler);
    };
  }

  private emit(event: string, ...args: any[]): void {
    for (const [key, zoneMap] of this.handlers) {
      if (key.startsWith(`${event}:`)) {
        for (const handlers of zoneMap.values()) {
          handlers.forEach((handler) => handler(...args));
        }
      }
    }
  }

  getDraggedElement(): HTMLElement | null {
    return this.draggedElement;
  }

  getDraggedId(): string | null {
    return this.draggedId;
  }

  getDraggedData(): unknown {
    return this.draggedData;
  }

  getHoverElement(): HTMLElement | null {
    return this.hoverElement;
  }

  isDragging(): boolean {
    return this.draggedElement !== null;
  }

  getDraggables(): string[] {
    return [...this.draggables.keys()];
  }

  getDropZones(): string[] {
    return [...this.dropZones.keys()];
  }

  clear(): void {
    this.draggables.clear();
    this.dropZones.clear();
    this.handlers.clear();
    this.draggedElement = null;
    this.draggedId = null;
    this.draggedData = null;
    this.hoverElement = null;
  }
}

export function createDragDropManager(): DragDropManager {
  return new DragDropManager();
}

export class GestureRecognizer {
  private element: HTMLElement;
  private startX: number = 0;
  private startY: number = 0;
  private currentX: number = 0;
  private currentY: number = 0;
  private startTime: number = 0;
  private isTracking: boolean = false;
  private pointers: Map<number, { x: number; y: number }> = new Map();
  private handlers: Map<string, Set<(data: GestureData) => void>> = new Map();

  constructor(element: HTMLElement) {
    this.element = element;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.element.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.element.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.element.addEventListener("touchend", this.onTouchEnd);
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.startTime = Date.now();
      this.isTracking = true;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.isTracking || e.touches.length !== 1) return;
    this.currentX = e.touches[0].clientX;
    this.currentY = e.touches[0].clientY;
    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;
    this.emit("pan", { dx, dy, startX: this.startX, startY: this.startY, currentX: this.currentX, currentY: this.currentY });
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (!this.isTracking) return;
    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;
    const duration = Date.now() - this.startTime;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 10 && duration < 300) {
      this.emit("tap", { x: this.startX, y: this.startY });
    } else if (distance < 10 && duration >= 500) {
      this.emit("longpress", { x: this.startX, y: this.startY, duration });
    } else if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 50) this.emit("swiperight", { dx, dy, distance });
      else if (dx < -50) this.emit("swipeleft", { dx, dy, distance });
    } else {
      if (dy > 50) this.emit("swipedown", { dx, dy, distance });
      else if (dy < -50) this.emit("swipeup", { dx, dy, distance });
    }
    this.isTracking = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startTime = Date.now();
      this.isTracking = true;
    } else if (this.pointers.size === 2) {
      this.emit("pinchstart", { pointers: [...this.pointers.values()] });
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const points = [...this.pointers.values()];
      const distance = Math.sqrt(
        Math.pow(points[0].x - points[1].x, 2) +
        Math.pow(points[0].y - points[1].y, 2),
      );
      this.emit("pinch", { distance, pointers: points });
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.emit("pinchend", {});
    }
    if (this.pointers.size === 0) {
      this.isTracking = false;
    }
  };

  on(event: string, handler: (data: GestureData) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: GestureData): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  destroy(): void {
    this.element.removeEventListener("touchstart", this.onTouchStart);
    this.element.removeEventListener("touchmove", this.onTouchMove);
    this.element.removeEventListener("touchend", this.onTouchEnd);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.handlers.clear();
    this.pointers.clear();
  }
}

export interface GestureData {
  dx?: number;
  dy?: number;
  startX?: number;
  startY?: number;
  currentX?: number;
  currentY?: number;
  x?: number;
  y?: number;
  duration?: number;
  distance?: number;
  pointers?: Array<{ x: number; y: number }>;
}

export function createGestureRecognizer(element: HTMLElement): GestureRecognizer {
  return new GestureRecognizer(element);
}
