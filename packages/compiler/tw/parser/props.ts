import { escapeRegex } from "../utils/string/escape";
/**
 * Component prop parser -- typed props, defaults, validation.
 *
 * In Next.js (React), props are typed via TypeScript interfaces:
 *   interface ButtonProps { color: string; size?: 'sm' | 'md' | 'lg'; }
 *
 * In TW, props are declared inline in the component definition:
 *   @component Button {
 *     @props {
 *       color: string = 'blue'
 *       size: 'sm' | 'md' | 'lg' = 'md'
 *       onClick: function
 *       children: any
 *     }
 *     <button class={color}>{children}</button>
 *   }
 *
 * This module parses the @props block and generates:
 * - Type checking at compile time
 * - Default value injection
 * - Runtime validation
 * - JSDoc for IDE autocompletion
 */

import type { Token } from "../lexer/tokens";

// --- Prop Type AST ---------------------------------------------------

export type PropType =
  | { kind: "primitive"; name: "string" | "number" | "boolean" | "bigint" | "symbol" | "null" | "undefined" | "any" | "unknown" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "union"; types: PropType[] }
  | { kind: "array"; element: PropType }
  | { kind: "object"; fields: Array<{ name: string; type: PropType; optional: boolean }> }
  | { kind: "function"; params: Array<{ name: string; type: PropType }>; returns: PropType }
  | { kind: "reference"; name: string } // User-defined type
  | { kind: "tuple"; elements: PropType[] }
  | { kind: "record"; key: PropType; value: PropType }
  | { kind: "enum"; values: Array<string | number> };

export interface PropDef {
  name: string;
  type: PropType;
  optional: boolean;
  default?: string;
  description?: string;
  /** JSDoc-style @deprecated */
  deprecated?: string;
  /** Validation constraints */
  constraints?: PropConstraints;
}

export interface PropConstraints {
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Minimum length (for strings/arrays) */
  minLength?: number;
  /** Maximum length (for strings/arrays) */
  maxLength?: number;
  /** Regex pattern (for strings) */
  pattern?: string;
  /** Must be one of these values */
  oneOf?: string[];
  /** Custom validator function name */
  validator?: string;
}

export interface PropsBlock {
  props: PropDef[];
  /** Does this component accept rest props? (...props) */
  restProps: boolean;
  /** Children type */
  childrenType?: PropType;
  /** Are children required? */
  childrenRequired: boolean;
}

// --- Prop Parser -----------------------------------------------------

/**
 * Parse a @props { ... } block from tokens.
 *
 * Grammar:
 *   PropsBlock  := '{' PropDef* RestProps? ChildrenType? '}'
 *   PropDef     := PropName ':' PropType ('=' DefaultValue)? ('|' Constraint)* Description?
 *   PropName    := Identifier
 *   PropType    := UnionType
 *   UnionType   := PrimaryType ('|' PrimaryType)*
 *   PrimaryType := Primitive | Literal | ArrayType | ObjectType | FunctionType | Reference
 *   ArrayType   := PropType '[]'
 *   ObjectType  := '{' (FieldName ':' PropType '?'?)* '}'
 *   FunctionType:= '(' (Param ':' PropType)* ')' '=>' PropType
 *   RestProps   := '...' Identifier
 *   ChildrenType:= '@children' ':' PropType
 */
export class PropParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter((t) => {
      const tt = (t as any).token_type ?? (t as any).type ?? "";
      return tt !== "WHITESPACE" && tt !== "NEWLINE";
    });
  }

  parsePropsBlock(): PropsBlock {
    const props: PropDef[] = [];
    let restProps = false;
    let childrenType: PropType | undefined;
    let childrenRequired = false;

    this.expect("{");

    while (!this.check("}") && !this.isAtEnd()) {
      // Rest props: ...props
      if (this.check("...")) {
        this.advance();
        const name = this.consume("IDENT");
        restProps = true;
        continue;
      }

      // Children type: @children
      if (this.check("@")) {
        this.advance();
        const name = this.consume("IDENT");
        if (name === "children") {
          this.expect(":");
          childrenType = this.parseType();
          childrenRequired = !this.check("?");
          if (this.check("?")) this.advance();
        }
        continue;
      }

      // Regular prop
      const prop = this.parsePropDef();
      if (prop) props.push(prop);
    }

    this.expect("}");

    return { props, restProps, childrenType, childrenRequired };
  }

  private parsePropDef(): PropDef | null {
    const name = this.consume("IDENT");
    if (!name) return null;

    this.expect(":");

    const type = this.parseType();

    const optional = this.check("?");
    if (optional) this.advance();

    // Default value
    let defaultVal: string | undefined;
    if (this.check("=")) {
      this.advance();
      defaultVal = this.consumeUntil(["\n", "|", "}"]);
      defaultVal = defaultVal.trim();
    }

    // Constraints (| constraint | constraint)
    let constraints: PropConstraints | undefined;
    while (this.check("|")) {
      this.advance();
      if (!constraints) constraints = {};
      this.parseConstraint(constraints);
    }

    return { name, type, optional, default: defaultVal, constraints };
  }

  private parseType(): PropType {
    return this.parseUnionType();
  }

  private parseUnionType(): PropType {
    const types: PropType[] = [this.parsePrimaryType()];

    while (this.check("|")) {
      this.advance();
      types.push(this.parsePrimaryType());
    }

    if (types.length === 1) return types[0];
    return { kind: "union", types };
  }

  private parsePrimaryType(): PropType {
    // Array type: Type[]
    if (this.check("[")) {
      this.advance();
      const element = this.parseType();
      this.expect("]");
      if (this.check("[")) {
        // Multi-dimensional array
        this.advance();
        this.expect("]");
        return { kind: "array", element: { kind: "array", element } };
      }
      return { kind: "array", element };
    }

    // Object type: { field: Type, ... }
    if (this.check("{")) {
      this.advance();
      const fields: Array<{ name: string; type: PropType; optional: boolean }> = [];

      while (!this.check("}") && !this.isAtEnd()) {
        const fieldName = this.consume("IDENT");
        this.expect(":");
        const fieldType = this.parseType();
        const fieldOptional = this.check("?");
        if (fieldOptional) this.advance();
        fields.push({ name: fieldName, type: fieldType, optional: fieldOptional });
        if (this.check(",")) this.advance();
      }

      this.expect("}");
      return { kind: "object", fields };
    }

    // Function type: (params) => ReturnType
    if (this.check("(")) {
      this.advance();
      const params: Array<{ name: string; type: PropType }> = [];

      while (!this.check(")") && !this.isAtEnd()) {
        const paramName = this.consume("IDENT");
        this.expect(":");
        const paramType = this.parseType();
        params.push({ name: paramName, type: paramType });
        if (this.check(",")) this.advance();
      }

      this.expect(")");
      this.expect("=>");
      const returns = this.parseType();
      return { kind: "function", params, returns };
    }

    // Literal: "string", 42, true
    if (this.check("STRING")) {
      return { kind: "literal", value: this.advance().value };
    }
    if (this.check("NUMBER")) {
      return { kind: "literal", value: Number(this.advance().value) };
    }
    if (this.check("true") || this.check("false")) {
      return { kind: "literal", value: this.advance().value === "true" };
    }

    // Primitive or reference
    const name = this.consume("IDENT") ?? this.advance().value;

    if (["string", "number", "boolean", "bigint", "symbol", "null", "undefined", "any", "unknown"].includes(name)) {
      return { kind: "primitive", name: name as "string" | "number" | "boolean" | "bigint" | "symbol" | "null" | "undefined" | "any" | "unknown" };
    }

    return { kind: "reference", name };
  }

  private parseConstraint(constraints: PropConstraints): void {
    const name = this.consume("IDENT");

    switch (name) {
      case "min":
        this.expect(":");
        constraints.min = Number(this.consume("NUMBER"));
        break;
      case "max":
        this.expect(":");
        constraints.max = Number(this.consume("NUMBER"));
        break;
      case "minLength":
        this.expect(":");
        constraints.minLength = Number(this.consume("NUMBER"));
        break;
      case "maxLength":
        this.expect(":");
        constraints.maxLength = Number(this.consume("NUMBER"));
        break;
      case "pattern":
        this.expect(":");
        constraints.pattern = this.consume("STRING");
        break;
      case "oneOf":
        this.expect(":");
        constraints.oneOf = this.consumeArray("STRING");
        break;
      case "validator":
        this.expect(":");
        constraints.validator = this.consume("IDENT");
        break;
      default:
        break;

    }
  }

  // --- Token Helpers --------------------------------------------------

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private check(type: string): boolean {
    const tok = this.peek() as any;
    return tok?.token_type === type || tok?.type === type || tok?.value === type;
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    if (!this.check(type)) {
      throw new Error(`Expected ${type} but got ${this.peek()?.value ?? "EOF"}`);
    }
    return this.advance();
  }

  private consume(type: string): string {
    if (this.check(type)) {
      return this.advance().value;
    }
    return "";
  }

  private consumeUntil(delimiters: string[]): string {
    let result = "";
    while (!this.isAtEnd() && !delimiters.includes(this.peek()?.value ?? "")) {
      result += this.advance().value;
      if (this.peek()?.followedByWhitespace) result += " ";
    }
    return result;
  }

  private consumeArray(type: string): string[] {
    const result: string[] = [];
    this.expect("[");
    while (!this.check("]") && !this.isAtEnd()) {
      if (this.check(type)) result.push(this.advance().value);
      if (this.check(",")) this.advance();
    }
    this.expect("]");
    return result;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length;
  }
}

// --- Prop Validation --------------------------------------------------

/**
 * Validate a prop value against its type definition.
 * Returns null if valid, or an error message.
 *
 * This runs at compile time (in the semantic analysis phase)
 * AND at runtime (in dev mode).
 */
export function validateProp(value: unknown, type: PropType): string | null {
  switch (type.kind) {
    case "primitive":
      if (type.name === "any" || type.name === "unknown") return null;
      if (type.name === "string" && typeof value !== "string") return `Expected string, got ${typeof value}`;
      if (type.name === "number" && typeof value !== "number") return `Expected number, got ${typeof value}`;
      if (type.name === "boolean" && typeof value !== "boolean") return `Expected boolean, got ${typeof value}`;
      return null;

    case "literal":
      if (value !== type.value) return `Expected ${JSON.stringify(type.value)}, got ${JSON.stringify(value)}`;
      return null;

    case "union":
      for (const t of type.types) {
        if (validateProp(value, t) === null) return null;
      }
      return `Value ${JSON.stringify(value)} does not match any type in union`;

    case "array":
      if (!Array.isArray(value)) return `Expected array, got ${typeof value}`;
      for (const item of value) {
        const err = validateProp(item, type.element);
        if (err) return `Array item: ${err}`;
      }
      return null;

    case "object":
      if (typeof value !== "object" || value === null) return `Expected object, got ${typeof value}`;
      for (const field of type.fields) {
        const fieldValue = (value as Record<string, unknown>)[field.name];
        if (fieldValue === undefined) {
          if (!field.optional) return `Missing required field: ${field.name}`;
        } else {
          const err = validateProp(fieldValue, field.type);
          if (err) return `Field ${field.name}: ${err}`;
        }
      }
      return null;

    case "function":
      if (typeof value !== "function") return `Expected function, got ${typeof value}`;
      return null;

    case "reference":
      // Can't validate without resolving the reference
      return null;

    case "tuple":
      if (!Array.isArray(value)) return `Expected tuple, got ${typeof value}`;
      if (value.length !== type.elements.length) return `Expected ${type.elements.length} elements, got ${value.length}`;
      for (let i = 0; i < type.elements.length; i++) {
        const err = validateProp(value[i], type.elements[i]);
        if (err) return `Tuple[${i}]: ${err}`;
      }
      return null;

    case "record":
      if (typeof value !== "object" || value === null) return `Expected record, got ${typeof value}`;
      return null;

    case "enum":
      if (!type.values.includes(value as string | number)) return `Expected one of ${type.values.join(", ")}`;
      return null;
      default:
        break;

  }
}

/**
 * Check if a prop value satisfies constraints.
 */
export function validateConstraints(value: unknown, constraints?: PropConstraints): string | null {
  if (!constraints) return null;

  if (constraints.min !== undefined && typeof value === "number" && value < constraints.min) {
    return `Value ${value} is less than min ${constraints.min}`;
  }

  if (constraints.max !== undefined && typeof value === "number" && value > constraints.max) {
    return `Value ${value} is greater than max ${constraints.max}`;
  }

  if (constraints.minLength !== undefined && typeof value === "string" && value.length < constraints.minLength) {
    return `String length ${value.length} is less than minLength ${constraints.minLength}`;
  }

  if (constraints.maxLength !== undefined && typeof value === "string" && value.length > constraints.maxLength) {
    return `String length ${value.length} is greater than maxLength ${constraints.maxLength}`;
  }

  if (constraints.pattern !== undefined && typeof value === "string") {
    const patternSource = constraints.pattern.length > 1000 ? constraints.pattern.substring(0, 1000) : constraints.pattern;
    const regex = new RegExp(patternSource);
    if (!regex.test(value)) return `String "${value}" does not match pattern ${constraints.pattern}`;
  }

  if (constraints.oneOf !== undefined && !constraints.oneOf.includes(String(value))) {
    return `Value must be one of: ${constraints.oneOf.join(", ")}`;
  }

  return null;
}

// --- JSDoc Generation ------------------------------------------------

/**
 * Generate JSDoc for component props (for IDE autocompletion).
 */
export function generateJSDoc(propsBlock: PropsBlock): string {
  const lines: string[] = ["/**"];

  for (const prop of propsBlock.props) {
    const typeStr = typeToString(prop.type);
    const optionalStr = prop.optional ? "?" : "";
    const defaultStr = prop.default ? ` (default: ${prop.default})` : "";
    const descStr = prop.description ? ` ${prop.description}` : "";
    lines.push(` * @param ${prop.name}${optionalStr} {${typeStr}}${defaultStr}${descStr}`);
  }

  lines.push(" */");
  return lines.join("\n");
}

function typeToString(type: PropType): string {
  switch (type.kind) {
    case "primitive": return type.name;
    case "literal": return JSON.stringify(type.value);
    case "union": return type.types.map(typeToString).join(" | ");
    case "array": return `${typeToString(type.element)}[]`;
    case "object":
      return `{ ${type.fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${typeToString(f.type)}`).join(", ")} }`;
    case "function":
      return `(${type.params.map((p) => `${p.name}: ${typeToString(p.type)}`).join(", ")}) => ${typeToString(type.returns)}`;
    case "reference": return type.name;
    case "tuple": return `[${type.elements.map(typeToString).join(", ")}]`;
    case "record": return `Record<${typeToString(type.key)}, ${typeToString(type.value)}>`;
    case "enum": return type.values.map((v) => JSON.stringify(v)).join(" | ");
      default:
        break;

  }
}
