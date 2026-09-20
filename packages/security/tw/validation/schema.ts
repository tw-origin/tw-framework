/**
 * Schema Validation -- a powerful schema-based input validation
 * system with type coercion, custom validators, and detailed
 * error reporting.
 *
 * @module security/validation/schema
 */

/** A validation error. */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value: unknown;
}

/** Validation result. */
export interface ValidationResult<T = unknown> {
  valid: boolean;
  data: T | null;
  errors: ValidationError[];
}

/** Field schema definition. */
export interface FieldSchema {
  type?: "string" | "number" | "boolean" | "date" | "email" | "url" | "uuid" | "array" | "object";
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string | RegExp;
  enum?: unknown[];
  custom?: (value: unknown) => boolean | string;
  default?: unknown;
  transform?: (value: unknown) => unknown;
  message?: string;
  sanitize?: boolean;
}

/** Object schema definition. */
export type Schema = Record<string, FieldSchema>;

/** Type-safe schema validator. */
export class SchemaValidator {
  private schema: Schema;
  private sanitize: boolean;

  constructor(schema: Schema, sanitize: boolean = true) {
    this.schema = schema;
    this.sanitize = sanitize;
  }

  /** Validates data against the schema. */
  validate(data: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const result: Record<string, unknown> = {};

    for (const [field, rules] of Object.entries(this.schema)) {
      let value = data[field];

      // Apply default
      if (value === undefined && rules.default !== undefined) {
        value = rules.default;
      }

      // Check required
      if (value === undefined || value === null) {
        if (rules.required) {
          errors.push({
            field,
            message: rules.message ?? `${field} is required`,
            code: "REQUIRED",
            value,
          });
        }
        continue;
      }

      // Apply transform
      if (rules.transform) {
        value = rules.transform(value);
      }

      // Apply sanitization
      if (this.sanitize && typeof value === "string") {
        value = value.trim();
      }

      // Type validation
      if (rules.type) {
        const typeError = this.validateType(field, value, rules);
        if (typeError) {
          errors.push(typeError);
          continue;
        }
      }

      // Length validation (strings and arrays)
      if (rules.minLength !== undefined || rules.maxLength !== undefined) {
        const length = typeof value === "string" || Array.isArray(value) ? value.length : 0;
        if (rules.minLength !== undefined && length < rules.minLength) {
          errors.push({
            field,
            message: rules.message ?? `${field} must be at least ${rules.minLength} characters`,
            code: "MIN_LENGTH",
            value,
          });
        }
        if (rules.maxLength !== undefined && length > rules.maxLength) {
          errors.push({
            field,
            message: rules.message ?? `${field} must be at most ${rules.maxLength} characters`,
            code: "MAX_LENGTH",
            value,
          });
        }
      }

      // Numeric range validation
      if (rules.min !== undefined || rules.max !== undefined) {
        const numValue = typeof value === "string" ? parseFloat(value) : value;
        if (typeof numValue === "number" && !isNaN(numValue)) {
          if (rules.min !== undefined && numValue < rules.min) {
            errors.push({
              field,
              message: rules.message ?? `${field} must be at least ${rules.min}`,
              code: "MIN_VALUE",
              value,
            });
          }
          if (rules.max !== undefined && numValue > rules.max) {
            errors.push({
              field,
              message: rules.message ?? `${field} must be at most ${rules.max}`,
              code: "MAX_VALUE",
              value,
            });
          }
        }
      }

      // Pattern validation
      if (rules.pattern !== undefined && typeof value === "string") {
        const regex = rules.pattern instanceof RegExp
          ? rules.pattern
          : new RegExp(rules.pattern);
        if (!regex.test(value)) {
          errors.push({
            field,
            message: rules.message ?? `${field} has invalid format`,
            code: "PATTERN_MISMATCH",
            value,
          });
        }
      }

      // Enum validation
      if (rules.enum !== undefined && !rules.enum.includes(value)) {
        errors.push({
          field,
          message: rules.message ?? `${field} must be one of: ${rules.enum.join(", ")}`,
          code: "INVALID_ENUM",
          value,
        });
      }

      // Custom validator
      if (rules.custom) {
        const customResult = rules.custom(value);
        if (customResult !== true) {
          errors.push({
            field,
            message: typeof customResult === "string" ? customResult : (rules.message ?? `${field} is invalid`),
            code: "CUSTOM_VALIDATION",
            value,
          });
        }
      }

      result[field] = value;
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? result : null,
      errors,
    };
  }

  /** Validates the type of a value. */
  private validateType(field: string, value: unknown, rules: FieldSchema): ValidationError | null {
    switch (rules.type) {
      case "string":
        if (typeof value !== "string") {
          return { field, message: `${field} must be a string`, code: "TYPE_ERROR", value };
        }
        break;
      case "number":
        if (typeof value !== "number" || isNaN(value)) {
          return { field, message: `${field} must be a number`, code: "TYPE_ERROR", value };
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          return { field, message: `${field} must be a boolean`, code: "TYPE_ERROR", value };
        }
        break;
      case "date":
        if (!(value instanceof Date) && isNaN(Date.parse(String(value)))) {
          return { field, message: `${field} must be a valid date`, code: "TYPE_ERROR", value };
        }
        break;
      case "email":
        if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return { field, message: `${field} must be a valid email`, code: "TYPE_ERROR", value };
        }
        break;
      case "url":
        if (typeof value !== "string") {
          return { field, message: `${field} must be a string`, code: "TYPE_ERROR", value };
        }
        try { new URL(value); } catch {
          return { field, message: `${field} must be a valid URL`, code: "TYPE_ERROR", value };
        }
        break;
      case "uuid":
        if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
          return { field, message: `${field} must be a valid UUID`, code: "TYPE_ERROR", value };
        }
        break;
      case "array":
        if (!Array.isArray(value)) {
          return { field, message: `${field} must be an array`, code: "TYPE_ERROR", value };
        }
        break;
      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          return { field, message: `${field} must be an object`, code: "TYPE_ERROR", value };
        }
        break;
    }
    return null;
  }

  /** Validates a single field. */
  validateField(field: string, value: unknown): ValidationError | null {
    const rules = this.schema[field];
    if (!rules) return null;

    const data = { [field]: value };
    const result = this.validate(data);
    return result.errors.length > 0 ? result.errors[0] : null;
  }
}

/** Creates a new schema validator. */
export function createValidator(schema: Schema, sanitize?: boolean): SchemaValidator {
  return new SchemaValidator(schema, sanitize);
}

/** Common validation patterns. */
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/[^\s/$.?#].[^\s]*$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  phone: /^\+?[\d\s\-\(\)]{10,15}$/,
  postalCode: /^\d{5}(-\d{4})?$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  ip: /^(\d{1,3}\.){3}\d{1,3}$/,
  ipv6: /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i,
  creditCard: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
};

/** Built-in validators for common use cases. */
export const validators = {
  email: (value: unknown): boolean | string => {
    if (typeof value !== "string") return "Must be a string";
    return patterns.email.test(value) ? true : "Invalid email format";
  },
  url: (value: unknown): boolean | string => {
    if (typeof value !== "string") return "Must be a string";
    return patterns.url.test(value) ? true : "Invalid URL format";
  },
  phone: (value: unknown): boolean | string => {
    if (typeof value !== "string") return "Must be a string";
    return patterns.phone.test(value) ? true : "Invalid phone number";
  },
  uuid: (value: unknown): boolean | string => {
    if (typeof value !== "string") return "Must be a string";
    return patterns.uuid.test(value) ? true : "Invalid UUID";
  },
  creditCard: (value: unknown): boolean | string => {
    if (typeof value !== "string") return "Must be a string";
    const digits = value.replace(/[\s-]/g, "");
    if (!/^\d{13,19}$/.test(digits)) return "Invalid card number length";
    // Luhn algorithm
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0 ? true : "Invalid card number (Luhn check failed)";
  },
}
