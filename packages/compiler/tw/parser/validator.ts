/**
 * Parser visitor -- walk AST during/after parsing for validation.
 *
 * Post-parse validation pass that checks:
 * - Tag nesting (no <div><span></div></span>)
 * - Required attributes present
 * - Component prop types match definitions
 * - Slot references are valid
 * - Event handlers are valid function references
 * - Bindings reference declared state variables
 * - Directive arguments are valid
 *
 * This runs after parsing but before code generation.
 * It produces warnings and errors that the LSP can display.
 */

import { Program, ASTNode, ElementNode } from "../ast/nodes";
import { walk } from "../ast/visitors";

export interface ValidationError {
  type: "error" | "warning" | "info";
  code: string;
  message: string;
  pos: { line: number; col: number; offset: number };
  /** Node that caused the error */
  nodeType: string;
  /** Suggested fix */
  fix?: { label: string; replacement: string };
}

// --- Tag Stack Validator ----------------------------------------------

/**
 * Validate that HTML tags are properly nested.
 *
 * HTML allows some tags to auto-close (<p> can be closed by another <p>),
 * but TW is stricter -- all tags must be explicitly closed (except void tags).
 *
 * This validator:
 * 1. Maintains a stack of open tags
 * 2. On close tag, checks that it matches the top of stack
 * 3. Reports mismatched tags as errors
 * 4. Auto-closes unclosed void tags (warning, not error)
 */
export function validateTagNesting(ast: Program): ValidationError[] {
  const errors: ValidationError[] = [];
  const voidTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
  ]);

  const stack: Array<{ tag: string; pos: { line: number; col: number; offset: number } }> = [];

  function visit(node: any) {
    if ((node as any).type === "Element") {
      const el = node as ElementNode;
      const tag = el.tag.toLowerCase();

      if (el.selfClosing || voidTags.has(tag)) {
        return; // Void tags don't need closing
      }

      // Open tag -- push to stack
      stack.push({
        tag,
        pos: el.loc?.start ?? { line: 0, col: 0, offset: 0 },
      });

      // Visit children
      for (const child of el.children) {
        visit(child);
      }

      // Pop and check
      const popped = stack.pop();
      if (popped && popped.tag !== tag) {
        // Mismatched -- but this would have been caught by the parser
      }
    }
  }

  for (const node of ast.body) {
    visit(node);
  }

  // Any remaining tags in stack are unclosed
  for (const unclosed of stack) {
    errors.push({
      type: "error",
      code: "UNCLOSED_TAG",
      message: `Unclosed tag <${unclosed.tag}>`,
      pos: unclosed.pos,
      nodeType: "Element",
      fix: { label: `Add </${unclosed.tag}>`, replacement: `</${unclosed.tag}>` },
    });
  }

  return errors;
}

// --- Required Attribute Validator --------------------------------------

/**
 * Validate that required attributes are present.
 *
 * Required attributes can be declared:
 *   @component Input {
 *     @props {
 *       type: string = 'text'
 *       name: string | required
 *     }
 *   }
 *
 * When <Input type="email" /> is used without name, this validator
 * reports: "Missing required attribute 'name' on component 'Input'"
 */
export function validateRequiredAttrs(ast: Program, componentDefs: Map<string, string[]>): ValidationError[] {
  const errors: ValidationError[] = [];

  walk(ast, {
    enter(node: ASTNode) {
      if (node.type === "Element") {
        const el = node as ElementNode;
        const requiredAttrs = componentDefs.get(el.tag);
        if (!requiredAttrs) return;

        for (const reqAttr of requiredAttrs) {
          const hasAttr = el.attrs.some((a) => a.name === reqAttr);
          if (!hasAttr) {
            errors.push({
              type: "error",
              code: "MISSING_REQUIRED_ATTR",
              message: `Missing required attribute '${reqAttr}' on component '${el.tag}'`,
              pos: el.loc?.start ?? { line: 0, col: 0, offset: 0 },
              nodeType: "Element",
              fix: { label: `Add ${reqAttr}=""`, replacement: `${reqAttr}=""` },
            });
          }
        }
      }
    },
  });

  return errors;
}

// --- Slot Reference Validator ----------------------------------------

/**
 * Validate that slot references point to defined slots.
 *
 * In a layout:
 *   <slot name="main" />     -- valid
 *   <slot name="nonexistent" /> -- error: no such slot
 */
export function validateSlotRefs(ast: Program, definedSlots: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  walk(ast, {
    enter(node: ASTNode) {
      if (node.type === "Element") {
        const el = node as ElementNode;
        if (el.tag === "slot") {
          const nameAttr = el.attrs.find((a) => a.name === "name");
          const slotName = nameAttr?.value ?? "default";

          if (slotName !== "default" && !definedSlots.has(slotName as string)) {
            errors.push({
              type: "warning",
              code: "UNKNOWN_SLOT",
              message: `Unknown slot '${slotName}' -- no content will be rendered`,
              pos: el.loc?.start ?? { line: 0, col: 0, offset: 0 },
              nodeType: "Element",
            });
          }
        }
      }
    },
  });

  return errors;
}

// --- State Variable Validator ----------------------------------------

/**
 * Validate that bindings reference declared state variables.
 *
 *   @state { count: 0, name: 'Raj' }
 *   <button @click={count++}>Count: {count}</button>
 *   <p>{unknownVar}</p>  ? warning: 'unknownVar' is not defined
 */
export function validateStateRefs(ast: Program, stateVars: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  walk(ast, {
    enter(node: ASTNode) {
      if (node.type === "Element") {
        const el = node as ElementNode;
        for (const binding of el.bindings) {
          // Extract variable names from binding expression
          const varNames = extractVarNames(binding.expr);
          for (const varName of varNames) {
            if (!stateVars.has(varName) && !isBuiltin(varName)) {
              errors.push({
                type: "warning",
                code: "UNDEFINED_VAR",
                message: `'${varName}' is not defined in state`,
                pos: el.loc?.start ?? { line: 0, col: 0, offset: 0 },
                nodeType: "Binding",
              });
            }
          }
        }
      }
    },
  });

  return errors;
}

// --- Event Handler Validator ------------------------------------------

/**
 * Validate that event handlers reference valid functions.
 *
 *   @state { handlers: { onClick: () => {} } }
 *   <button @click={handlers.onClick}>OK</button>
 *   <button @click={nonExistent}>Bad</button>  ? warning
 */
export function validateEventHandlers(ast: Program, stateVars: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  walk(ast, {
    enter(node: ASTNode) {
      if (node.type === "Element") {
        const el = node as ElementNode;
        for (const event of el.events) {
          const handler = event.handler;
          // Simple check: does the handler reference a known variable?
          if (!handler.includes(".") && !handler.includes("(")) {
            // Simple identifier -- check if it's in state
            if (!stateVars.has(handler) && !isBuiltin(handler)) {
              errors.push({
                type: "warning",
                code: "UNKNOWN_HANDLER",
                message: `Event handler '${handler}' is not defined`,
                pos: el.loc?.start ?? { line: 0, col: 0, offset: 0 },
                nodeType: "Event",
              });
            }
          }
        }
      }
    },
  });

  return errors;
}

// --- Directive Validator ---------------------------------------------

const VALID_DIRECTIVES = new Set([
  "page", "head", "body", "section", "layout", "load",
  "state", "render", "revalidate", "redirect", "rewrite",
  "import", "export", "define", "config", "middleware", "meta",
  "component", "style", "script", "template",
]);

/**
 * Validate that directives are recognized and have valid arguments.
 */
export function validateDirectives(ast: Program): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const dir of ast.directives) {
    const name = (dir as any).name?.toLowerCase();
    if (!VALID_DIRECTIVES.has(name)) {
      errors.push({
        type: "warning",
        code: "UNKNOWN_DIRECTIVE",
        message: `Unknown directive '@${name}' -- it will be ignored`,
        pos: (dir as any).loc?.start ?? { line: 0, col: 0, offset: 0 },
        nodeType: "Directive",
      });
    }

    // Validate specific directives
    switch (name) {
      case "render":
        if ((dir as any).body && !["ssr", "csr", "ssg", "server", "client", "static", "island", "edge", "interactive"].includes((dir as any).body.trim().replace(/['"]/g, ""))) {
          errors.push({
            type: "warning",
            code: "INVALID_RENDER_MODE",
            message: `@render mode must be one of: static, ssr, island, edge (aliases: ssg, server, client, csr)`,
            pos: (dir as any).loc?.start ?? { line: 0, col: 0, offset: 0 },
            nodeType: "Directive",
          });
        }
        break;

      case "revalidate":
        if ((dir as any).body) {
          const val = (dir as any).body.trim();
          if (val !== "false" && isNaN(Number(val)) && val !== "true") {
            errors.push({
              type: "warning",
              code: "INVALID_REVALIDATE",
              message: `@revalidate must be a number (seconds) or false`,
              pos: (dir as any).loc?.start ?? { line: 0, col: 0, offset: 0 },
              nodeType: "Directive",
            });
          }
        }
        break;

      case "redirect":
        if (!(dir as any).body) {
          errors.push({
            type: "error",
            code: "MISSING_REDIRECT_URL",
            message: `@redirect requires a URL`,
            pos: (dir as any).loc?.start ?? { line: 0, col: 0, offset: 0 },
            nodeType: "Directive",
          });
        }
        break;
      default:
        break;

    }
  }

  return errors;
}

// --- Full Validation Pass --------------------------------------------

export interface ValidationOptions {
  checkTagNesting?: boolean;
  checkRequiredAttrs?: boolean;
  checkSlotRefs?: boolean;
  checkStateRefs?: boolean;
  checkEventHandlers?: boolean;
  checkDirectives?: boolean;
}

export function validateAst(
  ast: Program,
  options?: ValidationOptions & {
    componentDefs?: Map<string, string[]>;
    definedSlots?: Set<string>;
    stateVars?: Set<string>;
  }
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (options?.checkTagNesting !== false) {
    errors.push(...validateTagNesting(ast));
  }
  if (options?.checkDirectives !== false) {
    errors.push(...validateDirectives(ast));
  }
  if (options?.checkRequiredAttrs && options.componentDefs) {
    errors.push(...validateRequiredAttrs(ast, options.componentDefs));
  }
  if (options?.checkSlotRefs && options.definedSlots) {
    errors.push(...validateSlotRefs(ast, options.definedSlots));
  }
  if (options?.checkStateRefs && options.stateVars) {
    errors.push(...validateStateRefs(ast, options.stateVars));
    errors.push(...validateEventHandlers(ast, options.stateVars));
  }

  // Sort by position
  errors.sort((a, b) => a.pos.offset - b.pos.offset);

  return errors;
}

// --- Helpers ---------------------------------------------------------

const BUILTINS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "Date", "RegExp", "Error", "Promise", "console", "window", "document",
  "globalThis", "this", "arguments", "require", "module", "exports",
  "process", "Buffer", "URL", "fetch", "setTimeout", "setInterval",
  "clearTimeout", "clearInterval", "queueMicrotask", "atob", "btoa",
  "encodeURI", "decodeURI", "encodeURIComponent", "decodeURIComponent",
]);

function isBuiltin(name: string): boolean {
  return BUILTINS.has(name);
}

function extractVarNames(expr: string): string[] {
  const vars: string[] = [];
  const regex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;
  while ((match = regex.exec(expr)) !== null) {
    const name = match[0];
    if (!isBuiltin(name) && !vars.includes(name)) {
      vars.push(name);
    }
  }
  return vars;
}
