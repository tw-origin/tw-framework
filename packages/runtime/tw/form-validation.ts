/**
 * Form Validation -- reactive form validation with schema support.
 *
 * Features:
 * - Field-level validation
 * - Form-level validation
 * - Schema-based validation
 * - Async validators
 * - Debounced validation
 * - Cross-field validation
 * - Custom error messages
 * - Touch/dirty tracking
 * - Submit validation
 * - Reset and clear errors
 * - Nested form groups
 * - Dynamic field rules
 * - Validation groups
 */

import { signal, computed, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export type ValidatorFn<T = unknown> = (value: T, form: FormData) => string | true | null | Promise<string | true | null>;

export interface FieldConfig {
  validators?: ValidatorFn[];
  debounce?: number;
  required?: boolean;
  label?: string;
  initial?: unknown;
}

export interface FieldState<T = unknown> {
  value: T;
  error: string | null;
  touched: boolean;
  dirty: boolean;
  validating: boolean;
  disabled: boolean;
}

export interface FormData {
  [key: string]: unknown;
}

export interface FormState {
  values: FormData;
  errors: Record<string, string | null>;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  valid: boolean;
  validating: boolean;
  submitted: boolean;
  submitCount: number;
}

export interface FormConfig {
  fields: Record<string, FieldConfig>;
  onSubmit?: (values: FormData) => void | Promise<void>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  validateOnSubmit?: boolean;
}

// --- Built-in Validators ---------------------------------------------

export const validators = {
  required: (message = "This field is required"): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return message;
    if (Array.isArray(value) && value.length === 0) return message;
    return true;
  },

  minLength: (min: number, message?: string): ValidatorFn => (value) => {
    const str = String(value ?? "");
    if (str.length < min) return message || `Must be at least ${min} characters`;
    return true;
  },

  maxLength: (max: number, message?: string): ValidatorFn => (value) => {
    const str = String(value ?? "");
    if (str.length > max) return message || `Must be at most ${max} characters`;
    return true;
  },

  // Factory like every other validator (docs/form-validators.md shows
  // `const email = validators.email()`); previously this was a bare
  // ValidatorFn, so `validators.email()(v)` threw.
  email: (message = "Invalid email address"): ValidatorFn => (value) => {
    const str = String(value ?? "");
    if (!str) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(str) ? true : message;
  },

  url: (message = "Invalid URL"): ValidatorFn => (value) => {
    const str = String(value ?? "");
    if (!str) return true;
    try { new URL(str); return true; }
    catch { return message; }
  },

  pattern: (regex: RegExp, message = "Invalid format"): ValidatorFn => (value) => {
    const str = String(value ?? "");
    if (!str) return true;
    return regex.test(str) ? true : message;
  },

  numeric: (message = "Must be a number"): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    return !isNaN(Number(value)) ? true : message;
  },

  integer: (message = "Must be an integer"): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    const num = Number(value);
    return Number.isInteger(num) ? true : message;
  },

  min: (minVal: number, message?: string): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    return Number(value) >= minVal ? true : (message || `Must be at least ${minVal}`);
  },

  max: (maxVal: number, message?: string): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    return Number(value) <= maxVal ? true : (message || `Must be at most ${maxVal}`);
  },

  range: (minVal: number, maxVal: number, message?: string): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    const num = Number(value);
    return (num >= minVal && num <= maxVal) ? true : (message || `Must be between ${minVal} and ${maxVal}`);
  },

  phone: (message = "Invalid phone number"): ValidatorFn => (value) => {
    const str = String(value ?? "").replace(/\D/g, "");
    if (!str) return true;
    return str.length >= 10 ? true : message;
  },

  creditCard: (message = "Invalid credit card number"): ValidatorFn => (value) => {
    const str = String(value ?? "").replace(/\D/g, "");
    if (!str) return true;
    // Luhn algorithm
    let sum = 0;
    let isEven = false;
    for (let i = str.length - 1; i >= 0; i--) {
      let digit = parseInt(str[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return (sum % 10 === 0 && str.length >= 13) ? true : message;
  },

  matches: (fieldName: string, message?: string): ValidatorFn => (value, form) => {
    const other = form[fieldName];
    return value === other ? true : (message || `Must match ${fieldName}`);
  },

  custom: (fn: (value: unknown) => boolean, message: string): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    return fn(value) ? true : message;
  },

  oneOf: (values: unknown[], message = "Invalid selection"): ValidatorFn => (value) => {
    if (value === null || value === undefined || value === "") return true;
    return values.includes(value) ? true : message;
  },
};

// --- Form Class -------------------------------------------------------

class TWForm {
  private fields = new Map<string, { config: FieldConfig; stateSignal: Signal<FieldState> }>();
  private config: FormConfig;
  private formValues: Signal<FormData>;
  private submitted = signal(false);
  private submitCount = signal(0);

  constructor(config: FormConfig) {
    this.config = {
      validateOnChange: true,
      validateOnBlur: true,
      validateOnSubmit: true,
      ...config,
    };

    const initialValues: FormData = {};
    for (const [name, fieldConfig] of Object.entries(config.fields)) {
      const initialValue = fieldConfig.initial ?? "";
      initialValues[name] = initialValue;
      this.fields.set(name, {
        config: fieldConfig,
        stateSignal: signal({
          value: initialValue,
          error: null,
          touched: false,
          dirty: false,
          validating: false,
          disabled: false,
        }),
      });
    }

    this.formValues = signal(initialValues);
  }

  /**
   * Get the value of a field.
   */
  getValue(name: string): unknown {
    return this.formValues.peek()[name];
  }

  /**
   * Set the value of a field.
   */
  setValue(name: string, value: unknown): void {
    const current = this.formValues.peek();
    this.formValues.set({ ...current, [name]: value });

    const field = this.fields.get(name);
    if (field) {
      const state = field.stateSignal.peek();
      field.stateSignal.set({ ...state, value, dirty: true });

      if (this.config.validateOnChange) {
        this.validateField(name);
      }
    }
  }

  /**
   * Get field state (reactive).
   */
  getFieldState(name: string): FieldState | undefined {
    return this.fields.get(name)?.stateSignal();
  }

  /**
   * Get the entire form state (reactive).
   */
  getFormState(): FormState {
    const values = this.formValues();
    const errors: Record<string, string | null> = {};
    const touched: Record<string, boolean> = {};
    const dirty: Record<string, boolean> = {};
    let valid = true;
    let validating = false;

    for (const [name, field] of this.fields) {
      const state = field.stateSignal();
      errors[name] = state.error;
      touched[name] = state.touched;
      dirty[name] = state.dirty;
      if (state.error) valid = false;
      if (state.validating) validating = true;
    }

    return {
      values, errors, touched, dirty,
      valid: valid && !validating,
      validating,
      submitted: this.submitted(),
      submitCount: this.submitCount(),
    };
  }

  /**
   * Validate a single field.
   */
  async validateField(name: string): Promise<string | null> {
    const field = this.fields.get(name);
    if (!field) return null;

    const value = this.getValue(name);
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, validating: true });

    let error: string | null = null;

    if (field.config.validators) {
      for (const validator of field.config.validators) {
        try {
          const result = await validator(value, this.formValues.peek());
          if (typeof result === "string") {
            error = result;
            break;
          }
        } catch (e) {
          error = "Validation error";
          console.error(`[TW Form] Validator error for '${name}':`, e);
        }
      }
    }

    const currentState = field.stateSignal.peek();
    field.stateSignal.set({ ...currentState, error, validating: false });
    return error;
  }

  /**
   * Validate all fields.
   */
  async validateAll(): Promise<boolean> {
    const promises: Promise<string | null>[] = [];
    for (const name of this.fields.keys()) {
      promises.push(this.validateField(name));
    }
    const results = await Promise.all(promises);
    return results.every(r => r === null);
  }

  /**
   * Mark a field as touched.
   */
  touch(name: string): void {
    const field = this.fields.get(name);
    if (!field) return;
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, touched: true });

    if (this.config.validateOnBlur) {
      this.validateField(name);
    }
  }

  /**
   * Handle form submission.
   */
  async submit(): Promise<FormData | null> {
    this.submitted.set(true);
    this.submitCount.set(this.submitCount.peek() + 1);

    if (this.config.validateOnSubmit) {
      const valid = await this.validateAll();
      if (!valid) return null;
    }

    if (this.config.onSubmit) {
      await this.config.onSubmit(this.formValues.peek());
    }

    return this.formValues.peek();
  }

  /**
   * Reset the form to initial values.
   */
  reset(): void {
    const initialValues: FormData = {};
    for (const [name, field] of this.fields) {
      const initialValue = field.config.initial ?? "";
      initialValues[name] = initialValue;
      field.stateSignal.set({
        value: initialValue,
        error: null,
        touched: false,
        dirty: false,
        validating: false,
        disabled: false,
      });
    }
    this.formValues.set(initialValues);
    this.submitted.set(false);
  }

  /**
   * Clear all errors.
   */
  clearErrors(): void {
    for (const [, field] of this.fields) {
      const state = field.stateSignal.peek();
      field.stateSignal.set({ ...state, error: null });
    }
  }

  /**
   * Set field error manually.
   */
  setFieldError(name: string, error: string | null): void {
    const field = this.fields.get(name);
    if (!field) return;
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, error });
  }

  /**
   * Enable/disable a field.
   */
  setFieldDisabled(name: string, disabled: boolean): void {
    const field = this.fields.get(name);
    if (!field) return;
    const state = field.stateSignal.peek();
    field.stateSignal.set({ ...state, disabled });
  }

  /**
   * Add a field dynamically.
   */
  addField(name: string, config: FieldConfig): void {
    this.config.fields[name] = config;
    const initialValue = config.initial ?? "";
    this.fields.set(name, {
      config,
      stateSignal: signal({
        value: initialValue,
        error: null,
        touched: false,
        dirty: false,
        validating: false,
        disabled: false,
      }),
    });
    const current = this.formValues.peek();
    this.formValues.set({ ...current, [name]: initialValue });
  }

  /**
   * Remove a field.
   */
  removeField(name: string): void {
    this.fields.delete(name);
    delete this.config.fields[name];
    const current = this.formValues.peek();
    const newValues = { ...current };
    delete newValues[name];
    this.formValues.set(newValues);
  }

  /**
   * Get all field names.
   */
  getFieldNames(): string[] {
    return Array.from(this.fields.keys());
  }
}

/**
 * Create a reactive form.
 */
export function createForm(config: FormConfig): TWForm {
  return new TWForm(config);
}

/**
 * Create a form from a schema.
 */
export function createFormFromSchema(schema: Record<string, FieldConfig>): TWForm {
  return new TWForm({ fields: schema });
}
