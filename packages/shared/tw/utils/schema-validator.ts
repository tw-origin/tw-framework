/**
 * Schema validator -- validates objects against JSON schemas.
 * @module shared/utils
 */

export type SchemaType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "null" | "any";

export interface SchemaProperty {
  type?: SchemaType | SchemaType[];
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  additionalProperties?: boolean | SchemaProperty;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  default?: unknown;
  description?: string;
  title?: string;
  examples?: unknown[];
  nullable?: boolean;
  const?: unknown;
  multipleOf?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  patternProperties?: Record<string, SchemaProperty>;
  minProperties?: number;
  maxProperties?: number;
  oneOf?: SchemaProperty[];
  anyOf?: SchemaProperty[];
  allOf?: SchemaProperty[];
  not?: SchemaProperty;
  if?: SchemaProperty;
  then?: SchemaProperty;
  else?: SchemaProperty;
  $ref?: string;
  $defs?: Record<string, SchemaProperty>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data: unknown;
}

export interface ValidationError {
  path: string;
  message: string;
  expected: string;
  actual: string;
  schema: SchemaProperty;
  value: unknown;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

export interface ValidatorOptions {
  coerce?: boolean;
  removeAdditional?: boolean;
  useDefaults?: boolean;
  strict?: boolean;
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

const DEFAULT_OPTIONS: Required<ValidatorOptions> = {
  coerce: false,
  removeAdditional: false,
  useDefaults: false,
  strict: true,
  abortEarly: false,
  allowUnknown: false,
  stripUnknown: false,
};

export class SchemaValidator {
  private options: Required<ValidatorOptions>;
  private customFormats: Map<string, (value: string) => boolean> = new Map();
  private definitions: Map<string, SchemaProperty> = new Map();
  private stats = { totalValidations: 0, totalValid: 0, totalInvalid: 0, totalErrors: 0 };

  constructor(options: ValidatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.registerDefaultFormats();
  }

  private registerDefaultFormats(): void {
    this.customFormats.set("email", (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    this.customFormats.set("uri", (value) => /^https?:\/\/.+/.test(value));
    this.customFormats.set("uuid", (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
    this.customFormats.set("date", (value) => !isNaN(Date.parse(value)));
    this.customFormats.set("date-time", (value) => !isNaN(Date.parse(value)));
    this.customFormats.set("time", (value) => /^\d{2}:\d{2}:\d{2}$/.test(value));
    this.customFormats.set("ipv4", (value) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value));
    this.customFormats.set("ipv6", (value) => /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(value));
    this.customFormats.set("hostname", (value) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(value));
    this.customFormats.set("phone", (value) => /^\+?[1-9]\d{1,14}$/.test(value));
    this.customFormats.set("zip", (value) => /^\d{5}(-\d{4})?$/.test(value));
    this.customFormats.set("credit-card", (value) => /^\d{13,19}$/.test(value));
    this.customFormats.set("hex-color", (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value));
    this.customFormats.set("base64", (value) => /^[A-Za-z0-9+/]*={0,2}$/.test(value));
    this.customFormats.set("jwt", (value) => /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(value));
    this.customFormats.set("semver", (value) => /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(value));
    this.customFormats.set("isbn", (value) => /^\d{10}|\d{13}$/.test(value));
    this.customFormats.set("mac", (value) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value));
    this.customFormats.set("latitude", (value) => /^-?\d{1,2}\.\d+$/.test(value) && parseFloat(value) >= -90 && parseFloat(value) <= 90);
    this.customFormats.set("longitude", (value) => /^-?\d{1,3}\.\d+$/.test(value) && parseFloat(value) >= -180 && parseFloat(value) <= 180);
  }

  registerFormat(name: string, validator: (value: string) => boolean): this {
    this.customFormats.set(name, validator);
    return this;
  }

  unregisterFormat(name: string): this {
    this.customFormats.delete(name);
    return this;
  }

  hasFormat(name: string): boolean {
    return this.customFormats.has(name);
  }

  getFormats(): string[] {
    return [...this.customFormats.keys()];
  }

  registerDefinition(name: string, schema: SchemaProperty): this {
    this.definitions.set(name, schema);
    return this;
  }

  unregisterDefinition(name: string): this {
    this.definitions.delete(name);
    return this;
  }

  hasDefinition(name: string): boolean {
    return this.definitions.has(name);
  }

  getDefinition(name: string): SchemaProperty | undefined {
    return this.definitions.get(name);
  }

  validate(data: unknown, schema: SchemaProperty, path: string = ""): ValidationResult {
    this.stats.totalValidations++;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const validatedData = this.validateValue(data, schema, path, errors, warnings);
    const valid = errors.length === 0;
    if (valid) {
      this.stats.totalValid++;
    } else {
      this.stats.totalInvalid++;
      this.stats.totalErrors += errors.length;
    }
    return { valid, errors, warnings, data: validatedData };
  }

  validateAsync(data: unknown, schema: SchemaProperty, path: string = ""): Promise<ValidationResult> {
    return Promise.resolve(this.validate(data, schema, path));
  }

  private validateValue(value: unknown, schema: SchemaProperty, path: string, errors: ValidationError[], warnings: ValidationWarning[]): unknown {
    if (schema.$ref) {
      const refSchema = this.resolveRef(schema.$ref);
      if (refSchema) {
        return this.validateValue(value, refSchema, path, errors, warnings);
      }
      errors.push({
        path,
        message: `Cannot resolve $ref: ${schema.$ref}`,
        expected: "resolved reference",
        actual: "unresolved reference",
        schema,
        value,
      });
      return value;
    }

    if (schema.oneOf) {
      const results = schema.oneOf.map((s) => this.validate(value, s, path));
      const validCount = results.filter((r) => r.valid).length;
      if (validCount !== 1) {
        errors.push({
          path,
          message: `Value must match exactly one schema in oneOf (matched ${validCount})`,
          expected: "exactly one match",
          actual: `${validCount} matches`,
          schema,
          value,
        });
      }
      return value;
    }

    if (schema.anyOf) {
      const results = schema.anyOf.map((s) => this.validate(value, s, path));
      if (!results.some((r) => r.valid)) {
        errors.push({
          path,
          message: "Value must match at least one schema in anyOf",
          expected: "at least one match",
          actual: "no matches",
          schema,
          value,
        });
      }
      return value;
    }

    if (schema.allOf) {
      for (const subSchema of schema.allOf) {
        this.validateValue(value, subSchema, path, errors, warnings);
      }
    }

    if (schema.not) {
      let result = this.validate(value, schema.not, path);
      if (result.valid) {
        errors.push({
          path,
          message: "Value must NOT match the schema in not",
          expected: "no match",
          actual: "matched",
          schema,
          value,
        });
      }
    }

    if (schema.const !== undefined) {
      if (value !== schema.const) {
        errors.push({
          path,
          message: `Value must be ${JSON.stringify(schema.const)}`,
          expected: JSON.stringify(schema.const),
          actual: JSON.stringify(value),
          schema,
          value,
        });
      }
    }

    if (schema.enum) {
      if (!schema.enum.includes(value)) {
        errors.push({
          path,
          message: `Value must be one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`,
          expected: schema.enum.map((v) => JSON.stringify(v)).join(" | "),
          actual: JSON.stringify(value),
          schema,
          value,
        });
      }
    }

    if (schema.nullable && value === null) {
      return value;
    }

    if (value === null) {
      if (schema.type !== "null" && !(Array.isArray(schema.type) && schema.type.includes("null"))) {
        errors.push({
          path,
          message: "Value cannot be null",
          expected: "non-null",
          actual: "null",
          schema,
          value,
        });
      }
      return value;
    }

    if (value === undefined) {
      if (schema.default !== undefined && this.options.useDefaults) {
        return schema.default;
      }
      return value;
    }

    const types = Array.isArray(schema.type) ? schema.type : [schema.type ?? "any"];
    const matchedType = types.find((t) => this.checkType(value, t));
    if (!matchedType && !types.includes("any")) {
      errors.push({
        path,
        message: `Value must be of type ${types.join(" or ")}`,
        expected: types.join(" | "),
        actual: typeof value,
        schema,
        value,
      });
      return value;
    }

    switch (matchedType ?? typeof value) {
      case "string": this.validateString(value as string, schema, path, errors, warnings); break;
      case "number":
      case "integer": this.validateNumber(value as number, schema, path, errors); break;
      case "boolean": break;
      case "array": return this.validateArray(value as unknown[], schema, path, errors, warnings);
      case "object": return this.validateObject(value as Record<string, unknown>, schema, path, errors, warnings);
    }

    if (schema.format && typeof value === "string") {
      const formatValidator = this.customFormats.get(schema.format);
      if (formatValidator && !formatValidator(value)) {
        errors.push({
          path,
          message: `Value must match format "${schema.format}"`,
          expected: schema.format,
          actual: value,
          schema,
          value,
        });
      }
    }

    return value;
  }

  private checkType(value: unknown, type: SchemaType): boolean {
    switch (type) {
      case "string": return typeof value === "string";
      case "number": return typeof value === "number" && !isNaN(value);
      case "integer": return typeof value === "number" && Number.isInteger(value);
      case "boolean": return typeof value === "boolean";
      case "array": return Array.isArray(value);
      case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
      case "null": return value === null;
      case "any": return true;
      default: return false;
    }
  }

  private validateString(value: string, schema: SchemaProperty, path: string, errors: ValidationError[], warnings: ValidationWarning[]): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters long`,
        expected: `minLength: ${schema.minLength}`,
        actual: `length: ${value.length}`,
        schema,
        value,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters long`,
        expected: `maxLength: ${schema.maxLength}`,
        actual: `length: ${value.length}`,
        schema,
        value,
      });
    }
    if (schema.pattern) {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push({
            path,
            message: `String must match pattern: ${schema.pattern}`,
            expected: schema.pattern,
            actual: value,
            schema,
            value,
          });
        }
      } catch {
        warnings.push({ path, message: `Invalid regex pattern: ${schema.pattern}` });
      }
    }
  }

  private validateNumber(value: number, schema: SchemaProperty, path: string, errors: ValidationError[]): void {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Number must be at least ${schema.minimum}`,
        expected: `minimum: ${schema.minimum}`,
        actual: String(value),
        schema,
        value,
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Number must be at most ${schema.maximum}`,
        expected: `maximum: ${schema.maximum}`,
        actual: String(value),
        schema,
        value,
      });
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push({
        path,
        message: `Number must be greater than ${schema.exclusiveMinimum}`,
        expected: `> ${schema.exclusiveMinimum}`,
        actual: String(value),
        schema,
        value,
      });
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      errors.push({
        path,
        message: `Number must be less than ${schema.exclusiveMaximum}`,
        expected: `< ${schema.exclusiveMaximum}`,
        actual: String(value),
        schema,
        value,
      });
    }
    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      errors.push({
        path,
        message: `Number must be a multiple of ${schema.multipleOf}`,
        expected: `multipleOf: ${schema.multipleOf}`,
        actual: String(value),
        schema,
        value,
      });
    }
  }

  private validateArray(value: unknown[], schema: SchemaProperty, path: string, errors: ValidationError[], warnings: ValidationWarning[]): unknown[] {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        expected: `minItems: ${schema.minItems}`,
        actual: `items: ${value.length}`,
        schema,
        value,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        expected: `maxItems: ${schema.maxItems}`,
        actual: `items: ${value.length}`,
        schema,
        value,
      });
    }
    if (schema.uniqueItems) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push({
            path,
            message: "Array must have unique items",
            expected: "unique items",
            actual: "duplicate found",
            schema,
            value,
          });
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      const result: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const itemPath = `${path}[${i}]`;
        const validated = this.validateValue(value[i], schema.items, itemPath, errors, warnings);
        result.push(validated);
      }
      return result;
    }
    return value;
  }

  private validateObject(value: Record<string, unknown>, schema: SchemaProperty, path: string, errors: ValidationError[], warnings: ValidationWarning[]): Record<string, unknown> {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      errors.push({
        path,
        message: `Object must have at least ${schema.minProperties} properties`,
        expected: `minProperties: ${schema.minProperties}`,
        actual: `properties: ${Object.keys(value).length}`,
        schema,
        value,
      });
    }
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) {
      errors.push({
        path,
        message: `Object must have at most ${schema.maxProperties} properties`,
        expected: `maxProperties: ${schema.maxProperties}`,
        actual: `properties: ${Object.keys(value).length}`,
        schema,
        value,
      });
    }
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    const result: Record<string, unknown> = {};
    for (const reqProp of required) {
      if (!(reqProp in value)) {
        errors.push({
          path: path ? `${path}.${reqProp}` : reqProp,
          message: `Missing required property: ${reqProp}`,
          expected: reqProp,
          actual: "undefined",
          schema,
          value,
        });
      }
    }
    for (const [key, val] of Object.entries(value)) {
      const propPath = path ? `${path}.${key}` : key;
      if (key in properties) {
        (result as any)[key] = this.validateValue(val, properties[key], propPath, errors, warnings);
      } else if (schema.additionalProperties === false && !this.options.allowUnknown) {
        if (this.options.removeAdditional || this.options.stripUnknown) {
          continue;
        }
        errors.push({
          path: propPath,
          message: `Unknown property: ${key}`,
          expected: "no additional properties",
          actual: key,
          schema,
          value: val,
        });
      } else if (typeof schema.additionalProperties === "object") {
        (result as any)[key] = this.validateValue(val, schema.additionalProperties, propPath, errors, warnings);
      } else {
        (result as any)[key] = val;
      }
    }
    if (schema.patternProperties) {
      for (const [pattern, propSchema] of Object.entries(schema.patternProperties)) {
        try {
          const regex = new RegExp(pattern);
          for (const key of Object.keys(value)) {
            if (regex.test(key)) {
              const propPath = path ? `${path}.${key}` : key;
              (result as any)[key] = this.validateValue(value[key], propSchema, propPath, errors, warnings);
            }
          }
        } catch {
          warnings.push({ path, message: `Invalid pattern: ${pattern}` });
        }
      }
    }
    return result;
  }

  private resolveRef(ref: string): SchemaProperty | undefined {
    if (ref.startsWith("#/")) {
      const parts = ref.slice(2).split("/");
      let current: unknown = this.definitions;
      for (const part of parts) {
        if (part === "$defs" || part === "definitions") {
          current = this.definitions;
        } else if (typeof current === "object" && current !== null) {
          current = (current as Record<string, unknown>)[part];
        }
      }
      return current as SchemaProperty | undefined;
    }
    return this.definitions.get(ref);
  }

  compile(schema: SchemaProperty): (data: unknown) => ValidationResult {
    return (data: unknown) => this.validate(data, schema);
  }

  addSchema(name: string, schema: SchemaProperty): this {
    this.definitions.set(name, schema);
    return this;
  }

  getSchema(name: string): SchemaProperty | undefined {
    return this.definitions.get(name);
  }

  removeSchema(name: string): this {
    this.definitions.delete(name);
    return this;
  }

  clearSchemas(): this {
    this.definitions.clear();
    return this;
  }

  getSchemaCount(): number {
    return this.definitions.size;
  }

  getSchemaNames(): string[] {
    return [...this.definitions.keys()];
  }

  getStats(): { totalValidations: number; totalValid: number; totalInvalid: number; totalErrors: number; validRate: number } {
    return {
      ...this.stats,
      validRate: this.stats.totalValidations > 0 ? (this.stats.totalValid / this.stats.totalValidations) * 100 : 0,
    };
  }

  resetStats(): void {
    this.stats = { totalValidations: 0, totalValid: 0, totalInvalid: 0, totalErrors: 0 };
  }

  setOptions(options: Partial<ValidatorOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  getOptions(): Required<ValidatorOptions> {
    return { ...this.options };
  }

  isValid(data: unknown, schema: SchemaProperty): boolean {
    return this.validate(data, schema).valid;
  }

  assertValid(data: unknown, schema: SchemaProperty): void {
    const result = this.validate(data, schema);
    if (!result.valid) {
      const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
      throw new Error(`Validation failed: ${messages}`);
    }
  }

  coerce(data: unknown, schema: SchemaProperty): unknown {
    return this.validate(data, schema).data;
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createSchemaValidator(options?: ValidatorOptions): SchemaValidator {
  return new SchemaValidator(options);
}

export function validate(data: unknown, schema: SchemaProperty, options?: ValidatorOptions): ValidationResult {
  const validator = new SchemaValidator(options);
  return validator.validate(data, schema);
}

export function isValid(data: unknown, schema: SchemaProperty): boolean {
  return validate(data, schema).valid;
}

export function assertValid(data: unknown, schema: SchemaProperty): void {
  const result = validate(data, schema);
  if (!result.valid) {
    const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`Validation failed: ${messages}`);
  }
}

export class StringFormatter {
  private formatters: Map<string, (value: unknown, params?: string[]) => string> = new Map();

  constructor() {
    this.registerDefaultFormatters();
  }

  private registerDefaultFormatters(): void {
    this.formatters.set("upper", (v) => String(v).toUpperCase());
    this.formatters.set("lower", (v) => String(v).toLowerCase());
    this.formatters.set("capitalize", (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase());
    this.formatters.set("title", (v) => String(v).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
    this.formatters.set("trim", (v) => String(v).trim());
    this.formatters.set("reverse", (v) => String(v).split("").reverse().join(""));
    this.formatters.set("repeat", (v, params) => String(v).repeat(parseInt(params?.[0] ?? "1", 10)));
    this.formatters.set("pad", (v, params) => String(v).padStart(parseInt(params?.[0] ?? "0", 10), params?.[1] ?? " "));
    this.formatters.set("padEnd", (v, params) => String(v).padEnd(parseInt(params?.[0] ?? "0", 10), params?.[1] ?? " "));
    this.formatters.set("slice", (v, params) => String(v).slice(parseInt(params?.[0] ?? "0", 10), params?.[1] ? parseInt(params[1], 10) : undefined));
    this.formatters.set("replace", (v, params) => String(v).replace(new RegExp(params?.[0] ?? "", "g"), params?.[1] ?? ""));
    this.formatters.set("truncate", (v, params) => {
      const max = parseInt(params?.[0] ?? "50", 10);
      const s = String(v);
      return s.length > max ? s.slice(0, max) + (params?.[1] ?? "...") : s;
    });
    this.formatters.set("number", (v, params) => {
      const n = Number(v);
      const decimals = parseInt(params?.[0] ?? "0", 10);
      return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    });
    this.formatters.set("currency", (v, params) => {
      const n = Number(v);
      const currency = params?.[0] ?? "USD";
      return n.toLocaleString(undefined, { style: "currency", currency });
    });
    this.formatters.set("percent", (v, params) => {
      const n = Number(v);
      const decimals = parseInt(params?.[0] ?? "0", 10);
      return `${(n * 100).toFixed(decimals)}%`;
    });
    this.formatters.set("date", (v, params) => {
      const d = new Date(v as any);
      const format = params?.[0] ?? "short";
      if (format === "short") return d.toLocaleDateString();
      if (format === "long") return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      if (format === "iso") return d.toISOString();
      if (format === "time") return d.toLocaleTimeString();
      return d.toLocaleDateString();
    });
    this.formatters.set("json", (v) => JSON.stringify(v, null, 2));
    this.formatters.set("base64", (v) => {
      if (typeof btoa !== "undefined") return btoa(String(v));
      if (typeof Buffer !== "undefined") return Buffer.from(String(v)).toString("base64");
      return String(v);
    });
    this.formatters.set("hex", (v) => {
      let result = "";
      for (let i = 0; i < String(v).length; i++) {
        result += String(v).charCodeAt(i).toString(16).padStart(2, "0");
      }
      return result;
    });
    this.formatters.set("binary", (v) => {
      let result = "";
      for (let i = 0; i < String(v).length; i++) {
        result += String(v).charCodeAt(i).toString(2).padStart(8, "0");
      }
      return result;
    });
    this.formatters.set("camel", (v) => String(v).replace(/[-_](.)/g, (_, c) => c.toUpperCase()));
    this.formatters.set("kebab", (v) => String(v).replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[_\s]/g, "-"));
    this.formatters.set("snake", (v) => String(v).replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[\-\s]/g, "_"));
    this.formatters.set("pascal", (v) => String(v).replace(/(^|[-_])(.)/g, (_, __, c) => c.toUpperCase()));
    this.formatters.set("constant", (v) => String(v).replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase().replace(/[\-\s]/g, "_"));
    this.formatters.set("dot", (v) => String(v).replace(/([a-z])([A-Z])/g, "$1.$2").toLowerCase().replace(/[\-_\s]/g, "."));
    this.formatters.set("path", (v) => String(v).replace(/([a-z])([A-Z])/g, "$1/$2").toLowerCase().replace(/[\-_\s]/g, "/"));
    this.formatters.set("pluralize", (v) => {
      const s = String(v);
      if (s.endsWith("y")) return s.slice(0, -1) + "ies";
      if (s.endsWith("s") || s.endsWith("sh") || s.endsWith("ch") || s.endsWith("x") || s.endsWith("z")) return s + "es";
      return s + "s";
    });
    this.formatters.set("singularize", (v) => {
      const s = String(v);
      if (s.endsWith("ies")) return s.slice(0, -3) + "y";
      if (s.endsWith("es")) return s.slice(0, -2);
      if (s.endsWith("s")) return s.slice(0, -1);
      return s;
    });
    this.formatters.set("ordinal", (v) => {
      const n = parseInt(String(v), 10);
      const s = ["th", "st", "nd", "rd"];
      const v2 = n % 100;
      return n + (s[(v2 - 20) % 10] || s[v2] || s[0]);
    });
    this.formatters.set("compact", (v) => String(v).replace(/\s+/g, " ").trim());
    this.formatters.set("stripHtml", (v) => String(v).replace(/<[^>]*>/g, ""));
    this.formatters.set("escapeHtml", (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c] ?? c));
    this.formatters.set("unescapeHtml", (v) => String(v).replace(/&(amp|lt|gt|quot|#x27);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'" })[e] ?? e));
    this.formatters.set("escapeUrl", (v) => encodeURIComponent(String(v)));
    this.formatters.set("unescapeUrl", (v) => decodeURIComponent(String(v)));
    this.formatters.set("escapeRegex", (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    this.formatters.set("mask", (v, params) => {
      const s = String(v);
      const visible = parseInt(params?.[0] ?? "4", 10);
      if (s.length <= visible) return "*".repeat(s.length);
      return "*".repeat(s.length - visible) + s.slice(-visible);
    });
    this.formatters.set("initials", (v) => String(v).split(/\s+/).map((w) => w.charAt(0).toUpperCase()).join(""));
    this.formatters.set("slugify", (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
    this.formatters.set("truncateWords", (v, params) => {
      const max = parseInt(params?.[0] ?? "10", 10);
      const words = String(v).split(/\s+/);
      if (words.length <= max) return String(v);
      return words.slice(0, max).join(" ") + (params?.[1] ?? "...");
    });
    this.formatters.set("wrap", (v, params) => {
      const width = parseInt(params?.[0] ?? "80", 10);
      const words = String(v).split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        if ((line + " " + word).length > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = line ? line + " " + word : word;
        }
      }
      if (line) lines.push(line);
      return lines.join("\n");
    });
  }

  register(name: string, formatter: (value: unknown, params?: string[]) => string): this {
    this.formatters.set(name, formatter);
    return this;
  }

  unregister(name: string): this {
    this.formatters.delete(name);
    return this;
  }

  has(name: string): boolean {
    return this.formatters.has(name);
  }

  get(name: string): ((value: unknown, params?: string[]) => string) | undefined {
    return this.formatters.get(name);
  }

  getNames(): string[] {
    return [...this.formatters.keys()];
  }

  format(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
      const parts = key.split("|").map((p) => p.trim());
      const variableName = parts[0];
      const formatters = parts.slice(1);
      let value = data[variableName];
      if (value === undefined) return match;
      for (const formatterSpec of formatters) {
        const colonIndex = formatterSpec.indexOf(":");
        const formatterName = colonIndex === -1 ? formatterSpec : formatterSpec.slice(0, colonIndex);
        const formatterParams = colonIndex === -1 ? undefined : formatterSpec.slice(colonIndex + 1).split(",").map((p) => p.trim());
        const formatter = this.formatters.get(formatterName);
        if (formatter) {
          value = formatter(value, formatterParams);
        }
      }
      return String(value);
    });
  }

  formatString(value: string, formatterSpec: string): string {
    const colonIndex = formatterSpec.indexOf(":");
    const formatterName = colonIndex === -1 ? formatterSpec : formatterSpec.slice(0, colonIndex);
    const formatterParams = colonIndex === -1 ? undefined : formatterSpec.slice(colonIndex + 1).split(",").map((p) => p.trim());
    const formatter = this.formatters.get(formatterName);
    if (formatter) {
      return formatter(value, formatterParams);
    }
    return value;
  }

  clear(): this {
    this.formatters.clear();
    return this;
  }

  size(): number {
    return this.formatters.size;
  }
}

export function createStringFormatter(): StringFormatter {
  return new StringFormatter();
}

export function formatString(template: string, data: Record<string, unknown>): string {
  const formatter = new StringFormatter();
  return formatter.format(template, data);
}

export class ConversionUtils {
  static toString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  static toNumber(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseFloat(value) || 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === null || value === undefined) return 0;
    if (Array.isArray(value)) return value.length;
    if (typeof value === "object") return Object.keys(value).length;
    return NaN;
  }

  static toInteger(value: unknown): number {
    return Math.trunc(this.toNumber(value));
  }

  static toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const lower = value.toLowerCase().trim();
      return lower === "true" || lower === "1" || lower === "yes" || lower === "on";
    }
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  }

  static toArray(value: unknown): unknown[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split("");
    if (typeof value === "object") return Object.values(value);
    return [value];
  }

  static toObject(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (Array.isArray(value)) return Object.fromEntries(value.map((v, i) => [String(i), v]));
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return { value }; }
    }
    return { value };
  }

  static toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") return new Date(value);
    return new Date();
  }

  static toJSON(value: unknown): string {
    return JSON.stringify(value);
  }

  static fromJSON(value: string): unknown {
    try { return JSON.parse(value); } catch { return null; }
  }

  static toBase64(value: string): string {
    if (typeof btoa !== "undefined") return btoa(value);
    if (typeof Buffer !== "undefined") return Buffer.from(value).toString("base64");
    return value;
  }

  static fromBase64(value: string): string {
    if (typeof atob !== "undefined") return atob(value);
    if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString();
    return value;
  }

  static toHex(value: string): string {
    let result = "";
    for (let i = 0; i < value.length; i++) {
      result += value.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return result;
  }

  static fromHex(value: string): string {
    let result = "";
    for (let i = 0; i < value.length; i += 2) {
      result += String.fromCharCode(parseInt(value.slice(i, i + 2), 16));
    }
    return result;
  }

  static toBinary(value: string): string {
    let result = "";
    for (let i = 0; i < value.length; i++) {
      result += value.charCodeAt(i).toString(2).padStart(8, "0");
    }
    return result;
  }

  static fromBinary(value: string): string {
    let result = "";
    for (let i = 0; i < value.length; i += 8) {
      result += String.fromCharCode(parseInt(value.slice(i, i + 8), 2));
    }
    return result;
  }

  static toURLSearchParams(value: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined && val !== null) {
        params.set(key, String(val));
      }
    }
    return params.toString();
  }

  static fromURLSearchParams(value: string): Record<string, string> {
    const params = new URLSearchParams(value);
    const result: Record<string, string> = {};
    params.forEach((value, key) => { result[key] = value; });
    return result;
  }

  static toQueryString(value: Record<string, unknown>): string {
    return this.toURLSearchParams(value);
  }

  static fromQueryString(value: string): Record<string, string> {
    return this.fromURLSearchParams(value);
  }

  static toFormData(value: Record<string, unknown>): FormData {
    const formData = new FormData();
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined && val !== null) {
        formData.append(key, val as string);
      }
    }
    return formData;
  }

  static fromFormData(value: FormData): Record<string, string> {
    const result: Record<string, string> = {};
    value.forEach((val, key) => { result[key] = val as string; });
    return result;
  }

  static toMap(value: Record<string, unknown>): Map<string, unknown> {
    return new Map(Object.entries(value));
  }

  static fromMap(value: Map<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(value);
  }

  static toSet(value: unknown[]): Set<unknown> {
    return new Set(value);
  }

  static fromSet(value: Set<unknown>): unknown[] {
    return [...value];
  }

  static toCSV(value: Record<string, unknown>[], delimiter: string = ","): string {
    if (value.length === 0) return "";
    const headers = Object.keys(value[0]);
    const lines = [headers.join(delimiter)];
    for (const row of value) {
      const values = headers.map((h) => {
        const v = row[h];
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (s.includes(delimiter) || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });
      lines.push(values.join(delimiter));
    }
    return lines.join("\n");
  }

  static fromCSV(value: string, delimiter: string = ","): Record<string, unknown>[] {
    const lines = value.split("\n").filter(Boolean);
    if (lines.length === 0) return [];
    const headers = this.parseCSVLine(lines[0], delimiter);
    return lines.slice(1).map((line) => {
      const values = this.parseCSVLine(line, delimiter);
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => { row[h] = values[i]; });
      return row;
    });
  }

  private static parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }
    result.push(current);
    return result;
  }

  static toYAML(value: unknown, indent: number = 0): string {
    const spaces = "  ".repeat(indent);
    if (value === null) return "null";
    if (value === undefined) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      return value.map((v) => `${spaces}- ${this.toYAML(v, indent + 1)}`).join("\n");
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      return entries.map(([key, val]) => {
        if (typeof val === "object" && val !== null) {
          return `${spaces}${key}:\n${this.toYAML(val, indent + 1)}`;
        }
        return `${spaces}${key}: ${this.toYAML(val, indent + 1)}`;
      }).join("\n");
    }
    return String(value);
  }

  static toXML(value: Record<string, unknown>, rootName: string = "root"): string {
    const build = (obj: Record<string, unknown>, name: string): string => {
      if (obj === null || obj === undefined) return `<${name} />`;
      if (typeof obj !== "object") return `<${name}>${String(obj)}</${name}>`;
      if (Array.isArray(obj)) {
        return obj.map((item) => build(item as Record<string, unknown>, name)).join("");
      }
      const children = Object.entries(obj).map(([k, v]) => build(v as Record<string, unknown>, k)).join("");
      return `<${name}>${children}</${name}>`;
    };
    return build(value, rootName);
  }

  static toQueryString2(value: Record<string, unknown>): string {
    return this.toURLSearchParams(value);
  }

  static deepClone<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => this.deepClone(v)) as unknown as T;
    if (value instanceof Date) return new Date(value) as unknown as T;
    if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, this.deepClone(v)])) as unknown as T;
    if (value instanceof Set) return new Set([...value].map((v) => this.deepClone(v))) as unknown as T;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      (result as any)[key] = this.deepClone(val);
    }
    return result as unknown as T;
  }

  static deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      value.forEach((v) => this.deepFreeze(v));
    } else if (typeof value === "object") {
      for (const val of Object.values(value as Record<string, unknown>)) {
        this.deepFreeze(val);
      }
    }
    return Object.freeze(value);
  }

  static deepMerge<T extends Record<string, unknown>>(target: T, ...sources: Record<string, unknown>[]): T {
    const result = { ...target };
    for (const source of sources) {
      for (const [key, value] of Object.entries(source)) {
        if (typeof result[key] === "object" && typeof value === "object" && result[key] !== null && value !== null && !Array.isArray(result[key]) && !Array.isArray(value)) {
          (result as any)[key] = this.deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
          (result as any)[key] = value;
        }
      }
    }
    return result;
  }

  static flattenObject(obj: Record<string, unknown>, prefix: string = ""): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, newKey));
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }

  static unflattenObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const parts = key.split(".");
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current)) {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }
    return result;
  }
}

export function createConversionUtils(): typeof ConversionUtils {
  return ConversionUtils;
}
