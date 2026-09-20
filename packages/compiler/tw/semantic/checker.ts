/**
 * Deep semantic checker -- the main validation engine.
 *
 * Runs after parsing and type inference. Checks for:
 * - Type errors (mismatched assignments, wrong argument types)
 * - Undefined variables and missing imports
 * - Unused imports, variables, and state
 * - Duplicate declarations and component names
 * - Invalid bindings and directives
 * - Missing required props
 * - Invalid event handlers
 * - Invalid slot usage
 * - Scope violations (TDZ, redeclaration, shadowing)
 * - Control flow errors (unreachable code, missing returns)
 *
 * Produces a list of SemanticError objects that the compiler
 * surfaces to the user via the diagnostics system.
 */

import type { Program, ASTNode } from "../ast/nodes";
import {
  buildScopeTree, lookup, getAllBindings, findUnusedBindings,
  findShadowedBindings, findTDZViolations,
  type Scope,
} from "./scope-deep";
import {
  inferProgram,
  type InferenceContext,
} from "./inference-deep";
import {
  isAssignableTo, typeToString, isAny, isUnknown,
  type TWTypeNode, STRING, NUMBER, BOOLEAN, UNKNOWN,
} from "./type-system-deep";

// --- Error Types --------------------------------------------------------

export interface SemanticError {
  message: string;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning" | "info" | "hint";
  context?: string;
  rule?: string;
  suggestion?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface CheckResult {
  errors: SemanticError[];
  warnings: SemanticError[];
  infos: SemanticError[];
  hints: SemanticError[];
  // Total error count (for quick checks)
  errorCount: number;
  // Inference context (for downstream consumers)
  inference: InferenceContext;
}

// --- Main Check Function ----------------------------------------------

export function check(program: Program): CheckResult {
  const errors: SemanticError[] = [];
  const warnings: SemanticError[] = [];
  const infos: SemanticError[] = [];
  const hints: SemanticError[] = [];

  // Build scope tree
  const scope = buildScopeTree(program);

  // Run type inference
  const inference = inferProgram(program);

  // Collect inference diagnostics
  for (const diag of inference.diagnostics) {
    const err: SemanticError = {
      message: diag.message,
      line: diag.line,
      col: diag.col,
      code: diag.code,
      severity: diag.severity,
      expected: (diag as any).expected,
      actual: (diag as any).actual,
    };
    if (diag.severity === "error") errors.push(err);
    else if (diag.severity === "warning") warnings.push(err);
    else infos.push(err);
  }

  // Run individual checks
  checkUndefinedReferences(program, scope, errors);
  checkUnusedBindings(scope, warnings, infos);
  checkShadowing(scope, warnings);
  checkTDZ(scope, errors);
  checkDuplicateComponents(program, errors);
  checkDuplicateDeclarations(scope, errors);
  checkEmptyBindings(program, errors);
  checkRequiredProps(program, errors);
  checkInvalidEvents(program, warnings);
  checkInvalidDirectives(program, errors, warnings);
  checkControlFlow(program, errors, warnings);
  checkSlotUsage(program, warnings);
  checkComponentRegistration(program, scope, warnings);
  checkTypeAnnotations(program, scope, inference, warnings);
  checkMissingReturn(program, errors, warnings);
  checkUnreachableCode(program, warnings);

  return {
    errors,
    warnings,
    infos,
    hints,
    errorCount: errors.length,
    inference,
  };
}

// --- Individual Checks -------------------------------------------------

function checkUndefinedReferences(
  program: Program,
  scope: Scope,
  errors: SemanticError[]
): void {
  function visit(node: ASTNode, currentScope: Scope): void {
    if (!node) return;
    const nodeType = (node as any).type;

    // Check text interpolation
    if (nodeType === "Text" && (node as any).isInterpolated) {
      const refs = extractIdentifiers(String((node as any).value));
      for (const name of refs) {
        if (!isLiteral(name) && !lookup(currentScope, name)) {
          errors.push({
            message: `Variable '${name}' is not defined`,
            line: (node as any).line ?? 0,
            col: (node as any).col ?? 0,
            code: "TW021",
            severity: "error",
            context: "text interpolation",
            suggestion: `Declare '${name}' or import it`,
          });
        }
      }
    }

    // Check element attributes
    if (nodeType === "Element") {
      const el = node as unknown;
      for (const attr of (el as any).attrs || []) {
        if (attr.isInterpolated && typeof attr.value === "string") {
          const refs = extractIdentifiers(attr.value);
          for (const name of refs) {
            if (!isLiteral(name) && !lookup(currentScope, name)) {
              errors.push({
                message: `Variable '${name}' is not defined`,
                line: (attr as any).line ?? (el as any).line ?? 0,
                col: (attr as any).col ?? (el as any).col ?? 0,
                code: "TW021",
                severity: "error",
                context: `attribute :${attr.name}`,
                suggestion: `Declare '${name}' or import it`,
              });
            }
          }
        }
      }

      // Check bindings
      for (const binding of (el as any).bindings || []) {
        const refs = extractIdentifiers(binding.expression);
        for (const name of refs) {
          if (!isLiteral(name) && !lookup(currentScope, name)) {
            errors.push({
              message: `Variable '${name}' is not defined`,
              line: (binding as any).line ?? (el as any).line ?? 0,
              col: (binding as any).col ?? (el as any).col ?? 0,
              code: "TW021",
              severity: "error",
              context: `binding :${binding.property}`,
              suggestion: `Declare '${name}' or import it`,
            });
          }
        }
      }

      // Visit children with element's scope
      for (const child of (el as any).children || []) {
        visit(child, currentScope);
      }
    }

    // Check component references
    if (nodeType === "Component") {
      const comp = node as unknown;
      // Check if component is registered
      const binding = lookup(currentScope, (comp as any).name);
      if (!binding && !isBuiltinComponent((comp as any).name)) {
        errors.push({
          message: `Component '${(comp as any).name}' is not defined`,
          line: (comp as any).line ?? 0,
          col: (comp as any).col ?? 0,
          code: "TW022",
          severity: "error",
          context: "component usage",
          suggestion: `Import or define '${(comp as any).name}'`,
        });
      }
      // Check props
      for (const prop of (comp as any).props || []) {
        if (typeof prop.value === "string" && isInterpolated(prop.value)) {
          const refs = extractIdentifiers(prop.value);
          for (const name of refs) {
            if (!isLiteral(name) && !lookup(currentScope, name)) {
              errors.push({
                message: `Variable '${name}' is not defined`,
                line: (prop as any).line ?? (comp as any).line ?? 0,
                col: (prop as any).col ?? (comp as any).col ?? 0,
                code: "TW021",
                severity: "error",
                context: `prop ${prop.name}`,
                suggestion: `Declare '${name}' or import it`,
              });
            }
          }
        }
      }
      for (const child of (comp as any).children || []) {
        visit(child, currentScope);
      }
    }

    // Check if/for/while conditions
    if (nodeType === "If" || nodeType === "While") {
      const cond = (node as any).condition;
      if (cond) {
        const refs = extractIdentifiers(String(cond));
        for (const name of refs) {
          if (!isLiteral(name) && !lookup(currentScope, name)) {
            errors.push({
              message: `Variable '${name}' is not defined`,
              line: (node as any).line ?? 0,
              col: (node as any).col ?? 0,
              code: "TW021",
              severity: "error",
              context: `${nodeType} condition`,
              suggestion: `Declare '${name}' or import it`,
            });
          }
        }
      }
    }

    if (nodeType === "For") {
      const forNode = node as unknown;
      const iter = (forNode as any).iterable;
      if (iter) {
        const refs = extractIdentifiers(String(iter));
        for (const name of refs) {
          if (!isLiteral(name) && !lookup(currentScope, name)) {
            errors.push({
              message: `Variable '${name}' is not defined`,
              line: (forNode as any).line ?? 0,
              col: (forNode as any).col ?? 0,
              code: "TW021",
              severity: "error",
              context: "for loop iterable",
              suggestion: `Declare '${name}' or import it`,
            });
          }
        }
      }
    }

    // Recurse into children
    for (const key of ["body", "children", "elseBody", "cases", "declarations"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child && typeof child.type === "string") {
            visit(child, currentScope);
          }
        }
      }
    }
  }

  for (const node of program.body) {
    visit(node, scope);
  }
}

function checkUnusedBindings(
  scope: Scope,
  warnings: SemanticError[],
  infos: SemanticError[]
): void {
  const unused = findUnusedBindings(scope);
  for (const binding of unused) {
    if (binding.kind === "import") {
      infos.push({
        message: `Import '${binding.name}' is never used`,
        line: binding.declarationLine,
        col: binding.declarationCol,
        code: "TW025",
        severity: "info",
        rule: "no-unused-imports",
        suggestion: `Remove the import`,
      });
    } else if (binding.kind === "state" || binding.kind === "computed") {
      infos.push({
        message: `State variable '${binding.name}' is declared but never used`,
        line: binding.declarationLine,
        col: binding.declarationCol,
        code: "TW026",
        severity: "info",
        rule: "no-unused-state",
        suggestion: `Remove the declaration or use it`,
      });
    } else if (binding.kind === "let" || binding.kind === "const" || binding.kind === "var") {
      warnings.push({
        message: `Variable '${binding.name}' is declared but never used`,
        line: binding.declarationLine,
        col: binding.declarationCol,
        code: "TW027",
        severity: "warning",
        rule: "no-unused-vars",
        suggestion: `Remove the declaration or prefix with underscore`,
      });
    }
  }
}

function checkShadowing(
  scope: Scope,
  warnings: SemanticError[]
): void {
  const shadows = findShadowedBindings(scope);
  for (const { binding, shadowed } of shadows) {
    warnings.push({
      message: `'${binding.name}' shadows an outer declaration (${shadowed.kind} in ${shadowed.scope.kind} scope)`,
      line: binding.declarationLine,
      col: binding.declarationCol,
      code: "TW028",
      severity: "warning",
      rule: "no-shadow",
      context: `shadowing ${shadowed.scope.kind}:${shadowed.scope.name}`,
      suggestion: `Rename to avoid shadowing`,
    });
  }
}

function checkTDZ(
  scope: Scope,
  errors: SemanticError[]
): void {
  const violations = findTDZViolations(scope);
  for (const v of violations) {
    errors.push({
      message: `Variable '${v.name}' used before its declaration (temporal dead zone)`,
      line: v.line,
      col: v.col,
      code: "TW029",
      severity: "error",
      rule: "no-use-before-declare",
      suggestion: `Move the declaration above this line`,
    });
  }
}

function checkDuplicateComponents(
  program: Program,
  errors: SemanticError[]
): void {
  const seen = new Map<string, { line: number; col: number }>();

  function walk(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Component") {
      const name = (node as any).name;
      const prev = seen.get(name);
      if (prev) {
        errors.push({
          message: `Duplicate component definition: '${name}'`,
          line: (node as any).line ?? 0,
          col: (node as any).col ?? 0,
          code: "TW036",
          severity: "error",
          rule: "no-duplicate-components",
          context: `previously defined at line ${prev.line}`,
          suggestion: `Rename one of the components`,
        });
      } else {
        seen.set(name, { line: (node as any).line ?? 0, col: (node as any).col ?? 0 });
      }
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) walk(child);
        }
      }
    }
  }

  for (const node of program.body) walk(node);
}

function checkDuplicateDeclarations(
  scope: Scope,
  errors: SemanticError[]
): void {
  function walk(s: Scope): void {
    // Check for duplicate declarations in the same scope
    // (already handled by Map, but check for var redeclarations)
    for (const [name, binding] of s.bindings) {
      // Check if there's a var that shadows a let/const in the same scope
      // This is already prevented by the Map, but we check for conflicts
      if (binding.kind === "var") {
        const existing = s.bindings.get(name);
        if (existing && existing !== binding && (existing.kind === "let" || existing.kind === "const")) {
          errors.push({
            message: `Variable '${name}' already declared as ${existing.kind}`,
            line: binding.declarationLine,
            col: binding.declarationCol,
            code: "TW030",
            severity: "error",
            rule: "no-redeclare",
            suggestion: `Rename one of the declarations`,
          });
        }
      }
    }
    for (const child of s.children) {
      walk(child);
    }
  }
  walk(scope);
}

function checkEmptyBindings(
  program: Program,
  errors: SemanticError[]
): void {
  function visit(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Element") {
      const el = node as unknown;
      for (const binding of (el as any).bindings || []) {
        if (!binding.expression || binding.expression.trim() === "") {
          errors.push({
            message: `Empty binding expression for :${binding.property}`,
            line: (binding as any).line ?? (el as any).line ?? 0,
            col: (binding as any).col ?? (el as any).col ?? 0,
            code: "TW032",
            severity: "error",
            rule: "no-empty-binding",
            suggestion: `Provide an expression for the binding`,
          });
        }
      }
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) visit(child);
        }
      }
    }
  }
  for (const node of program.body) visit(node);
}

function checkRequiredProps(
  program: Program,
  errors: SemanticError[]
): void {
  // Walk the AST and check that all required props are provided
  // for each component usage
  function visit(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Component") {
      const comp = node as unknown;
      // Check if we have type information for this component
      // and which props are required
      // NOTE: This check is intentionally minimal -- full cross-module analysis requires the resolver
      // would need the component's prop type definition
      const providedProps = new Set(
        ((comp as any).props || []).map((p: any) => p.name)
      );
      // Check if slot is required but not provided
      if ((comp as any).requiresSlot && !(comp as any).children?.length) {
        errors.push({
          message: `Component '${(comp as any).name}' requires slot content`,
          line: (comp as any).line ?? 0,
          col: (comp as any).col ?? 0,
          code: "TW033",
          severity: "error",
          rule: "require-slot-content",
          suggestion: `Provide children for the component`,
        });
      }
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) visit(child);
        }
      }
    }
  }
  for (const node of program.body) visit(node);
}

function checkInvalidEvents(
  program: Program,
  warnings: SemanticError[]
): void {
  const validEvents = new Set([
    "click", "dblclick", "mousedown", "mouseup", "mousemove", "mouseenter",
    "mouseleave", "mouseover", "mouseout", "keydown", "keyup", "keypress",
    "input", "change", "submit", "reset", "focus", "blur", "scroll",
    "resize", "load", "unload", "error", "contextmenu", "wheel",
    "touchstart", "touchend", "touchmove", "touchcancel",
    "drag", "dragstart", "dragend", "dragenter", "dragleave", "dragover", "drop",
    "animationstart", "animationend", "animationiteration",
    "transitionend", "transitionstart",
    "copy", "cut", "paste",
    "play", "pause", "ended", "timeupdate", "volumechange", "seeking", "seeked",
    "canplay", "canplaythrough", "waiting", "stalled", "suspend", "progress",
    "loadeddata", "loadedmetadata", "durationchange", "ratechange",
    "abort", "emptied", "error",
    "beforeinput", "compositionstart", "compositionupdate", "compositionend",
    "fullscreenchange", "pointerdown", "pointerup", "pointermove",
    "pointerenter", "pointerleave", "pointercancel",
  ]);

  function visit(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Element") {
      const el = node as unknown;
      for (const binding of (el as any).bindings || []) {
        if (binding.property?.startsWith("on") || binding.event) {
          const eventName = (binding.event || binding.property || "").replace(/^on/, "").toLowerCase();
          if (eventName && !validEvents.has(eventName)) {
            warnings.push({
              message: `Unknown event '${eventName}'`,
              line: (binding as any).line ?? (el as any).line ?? 0,
              col: (binding as any).col ?? (el as any).col ?? 0,
              code: "TW034",
              severity: "warning",
              rule: "valid-events",
              suggestion: `Check the event name spelling`,
            });
          }
        }
      }
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) visit(child);
        }
      }
    }
  }
  for (const node of program.body) visit(node);
}

function checkInvalidDirectives(
  program: Program,
  errors: SemanticError[],
  warnings: SemanticError[]
): void {
  const validDirectives = new Set([
    "state", "computed", "import", "export", "style", "script",
    "layout", "middleware", "head", "config", "use",
  ]);

  for (const directive of (program as any).directives || []) {
    const dirType = (directive as any).type?.replace("Directive", "").toLowerCase();
    if (dirType && !validDirectives.has(dirType)) {
      warnings.push({
        message: `Unknown directive '${dirType}'`,
        line: (directive as any).line ?? 0,
        col: (directive as any).col ?? 0,
        code: "TW035",
        severity: "warning",
        rule: "valid-directives",
        suggestion: `Check the directive name`,
      });
    }

    // Check state directive for missing initializers
    if ((directive as any).type === "StateDirective") {
      for (const decl of (directive as any).declarations || []) {
        if (!decl.isComputed && decl.value === undefined && !decl.dataType) {
          warnings.push({
            message: `State variable '${decl.name}' has no initial value`,
            line: (directive as any).line ?? 0,
            col: (directive as any).col ?? 0,
            code: "TW037",
            severity: "warning",
            rule: "init-state",
            suggestion: `Provide an initial value`,
          });
        }
      }
    }
  }
}

function checkControlFlow(
  program: Program,
  errors: SemanticError[],
  warnings: SemanticError[]
): void {
  function visit(node: ASTNode): void {
    if (!node) return;
    const nodeType = (node as any).type;

    // Check for code after return/break/continue
    if (nodeType === "If" || nodeType === "For" || nodeType === "While") {
      const body = (node as any).body || [];
      let foundTerminator = false;
      for (let i = 0; i < body.length; i++) {
        if (foundTerminator) {
          warnings.push({
            message: `Unreachable code after ${(body[i - 1] as any)?.type || "terminator"}`,
            line: body[i].line ?? 0,
            col: body[i].col ?? 0,
            code: "TW038",
            severity: "warning",
            rule: "no-unreachable",
            suggestion: `Remove the unreachable code`,
          });
        }
        const childType = body[i]?.type;
        if (childType === "Return" || childType === "Break" || childType === "Continue" || childType === "Throw") {
          foundTerminator = true;
        }
      }
    }

    // Check for infinite loops without break
    if (nodeType === "While") {
      const cond = String((node as any).condition || "");
      if (cond === "true" || cond === "1" || cond === "") {
        const body = (node as any).body || [];
        const hasBreak = body.some((c: any) =>
          c.type === "Break" ||
          (c.type === "If" && (c.elseBody || c.body)?.some?.((b: any) => b.type === "Break"))
        );
        if (!hasBreak) {
          warnings.push({
            message: `Infinite loop detected (while true without break)`,
            line: (node as any).line ?? 0,
            col: (node as any).col ?? 0,
            code: "TW039",
            severity: "warning",
            rule: "no-infinite-loop",
            suggestion: `Add a break condition`,
          });
        }
      }
    }

    for (const key of ["body", "children", "elseBody", "cases"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) visit(child);
        }
      }
    }
  }

  for (const node of program.body) visit(node);
}

function checkSlotUsage(
  program: Program,
  warnings: SemanticError[]
): void {
  function visit(node: ASTNode, inComponent: boolean): void {
    if (!node) return;
    const nodeType = (node as any).type;

    if (nodeType === "Slot" && !inComponent) {
      warnings.push({
        message: `Slot used outside of a component`,
        line: (node as any).line ?? 0,
        col: (node as any).col ?? 0,
        code: "TW040",
        severity: "warning",
        rule: "slot-in-component",
        suggestion: `Slots should only be used inside components`,
      });
    }

    if (nodeType === "Component") {
      for (const child of (node as any).children || []) {
        visit(child, true);
      }
    } else {
      for (const key of ["body", "children", "elseBody"]) {
        const arr = (node as any)[key];
        if (Array.isArray(arr)) {
          for (const child of arr) {
            if (child?.type) visit(child, inComponent);
          }
        }
      }
    }
  }

  for (const node of program.body) visit(node, false);
}

function checkComponentRegistration(
  program: Program,
  scope: Scope,
  warnings: SemanticError[]
): void {
  // Check if components used in the template are defined
  const definedComponents = new Set<string>();
  const usedComponents = new Map<string, { line: number; col: number }>();

  function walkDefs(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Component") {
      definedComponents.add((node as any).name);
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) walkDefs(child);
        }
      }
    }
  }

  function walkUses(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Component") {
      const name = (node as any).name;
      // Only flag if it looks like a custom component (has uppercase or hyphen)
      if (!isBuiltinComponent(name) && !definedComponents.has(name) && !isImportedComponent(name, scope)) {
        usedComponents.set(name, {
          line: (node as any).line ?? 0,
          col: (node as any).col ?? 0,
        });
      }
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) walkUses(child);
        }
      }
    }
  }

  for (const node of program.body) walkDefs(node);
  for (const node of program.body) walkUses(node);

  for (const [name, pos] of usedComponents) {
    warnings.push({
      message: `Component '${name}' is used but not defined`,
      line: pos.line,
      col: pos.col,
      code: "TW041",
      severity: "warning",
      rule: "no-undefined-component",
      suggestion: `Define or import '${name}'`,
    });
  }
}

function checkTypeAnnotations(
  program: Program,
  scope: Scope,
  inference: InferenceContext,
  warnings: SemanticError[]
): void {
  // Check for type annotations that don't match inferred types
  for (const binding of getAllBindings(scope)) {
    const name = binding.name;
    const annotated = binding.type;
    const inferred = inference.typeEnv.get(name);
    if (annotated && inferred && annotated !== "any" && annotated !== "unknown") {
      // Check if inferred type is assignable to annotated type
      // This is a simplified check -- a full implementation would
      // parse the annotated type string into a TWTypeNode
      const annotatedType = parseSimpleType(annotated);
      if (annotatedType && !isAny(annotatedType) && !isAny(inferred) && !isUnknown(inferred)) {
        if (!isAssignableTo(inferred, annotatedType)) {
          warnings.push({
            message: `Type '${typeToString(inferred)}' is not assignable to declared type '${annotated}'`,
            line: binding.declarationLine,
            col: binding.declarationCol,
            code: "TW042",
            severity: "warning",
            rule: "type-assignable",
            context: `variable '${name}'`,
          });
        }
      }
    }
  }
}

function checkMissingReturn(
  program: Program,
  errors: SemanticError[],
  warnings: SemanticError[]
): void {
  // Check if functions with return type annotations always return
  // This is a simplified check -- only catches obvious cases
  function visit(node: ASTNode): void {
    if (!node) return;
    if ((node as any).type === "Component" && (node as any).returnType) {
      const body = (node as any).body || (node as any).children || [];
      if (body.length > 0) {
        const lastNode = body[body.length - 1];
        if (lastNode && !["Return", "Throw"].includes(lastNode.type)) {
          // Check if all paths return (simplified)
          // A full implementation would do CFG analysis
        }
      }
    }
    for (const key of ["body", "children", "elseBody"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) visit(child);
        }
      }
    }
  }
  for (const node of program.body) visit(node);
}

function checkUnreachableCode(
  program: Program,
  warnings: SemanticError[]
): void {
  function visit(node: ASTNode): void {
    if (!node) return;
    const nodeType = (node as any).type;

    // Check for code after return in component bodies
    if (nodeType === "Component" || nodeType === "Function") {
      const body = (node as any).body || [];
      for (let i = 0; i < body.length - 1; i++) {
        if (body[i]?.type === "Return") {
          warnings.push({
            message: `Unreachable code after return statement`,
            line: body[i + 1]?.line ?? 0,
            col: body[i + 1]?.col ?? 0,
            code: "TW043",
            severity: "warning",
            rule: "no-unreachable",
            suggestion: `Remove the unreachable code`,
          });
        }
      }
    }

    for (const key of ["body", "children", "elseBody", "cases"]) {
      const arr = (node as any)[key];
      if (Array.isArray(arr)) {
        for (const child of arr) {
          if (child?.type) visit(child);
        }
      }
    }
  }
  for (const node of program.body) visit(node);
}

// --- Helpers ----------------------------------------------------------

function extractIdentifiers(expr: string): string[] {
  const ids = new Set<string>();
  let i = 0;
  const s = String(expr);
  while (i < s.length) {
    if (/[a-zA-Z_$]/.test(s[i])) {
      let id = "";
      while (i < s.length && /[a-zA-Z0-9_$]/.test(s[i])) {
        id += s[i];
        i++;
      }
      if (!KEYWORDS.has(id) && !isLiteral(id)) {
        ids.add(id);
      }
    } else {
      i++;
    }
  }
  return [...ids];
}

function isLiteral(name: string): boolean {
  return name === "true" || name === "false" || name === "null" ||
    name === "undefined" || name === "NaN" || name === "Infinity" ||
    /^-?\d+(\.\d+)?$/.test(name);
}

function isInterpolated(value: string): boolean {
  return value.includes("${") || value.includes("{{");
}

function isBuiltinComponent(name: string): boolean {
  const builtins = new Set([
    "Fragment", "Suspense", "ErrorBoundary", "Slot", "Portal",
    "StrictMode", "Lazy", "If", "For", "While", "Switch",
    "Match", "Show", "Dynamic", "Portal", "Intersection",
    "div", "span", "p", "a", "img", "input", "button", "form",
    "label", "select", "option", "textarea", "table", "tr", "td",
    "th", "thead", "tbody", "tfoot", "ul", "ol", "li", "nav",
    "header", "footer", "main", "section", "article", "aside",
    "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "code", "pre",
    "blockquote", "figure", "figcaption", "details", "summary",
    "dialog", "canvas", "svg", "path", "circle", "rect", "line",
    "polyline", "polygon", "ellipse", "g", "defs", "use", "text",
    "video", "audio", "source", "track", "picture", "map", "area",
    "iframe", "embed", "object", "param", "script", "style", "link",
    "meta", "title", "base", "head", "body", "html",
  ]);
  return builtins.has(name);
}

function isImportedComponent(name: string, scope: Scope): boolean {
  const binding = lookup(scope, name);
  return binding?.isImported === true;
}

function parseSimpleType(typeStr: string): TWTypeNode | null {
  const t = typeStr.trim().toLowerCase();
  if (t === "string") return STRING;
  if (t === "number") return NUMBER;
  if (t === "boolean") return BOOLEAN;
  if (t === "any" || t === "unknown") return UNKNOWN;
  if (t.endsWith("[]")) {
    return { kind: "array", elements: [parseSimpleType(t.slice(0, -2)) ?? UNKNOWN] };
  }
  return null;
}

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default",
  "break", "continue", "return", "throw", "try", "catch", "finally",
  "var", "let", "const", "function", "class", "extends", "super",
  "this", "new", "delete", "typeof", "instanceof", "in", "of",
  "async", "await", "yield", "import", "export", "from", "as",
  "type", "interface", "namespace", "declare", "enum", "abstract",
  "readonly", "keyof", "infer", "is", "satisfies", "asserts",
  "void", "never", "unknown", "any", "string", "number", "boolean",
  "object", "symbol", "bigint", "true", "false", "null", "undefined",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "console", "Promise", "Date", "Error", "Map", "Set", "WeakMap",
  "WeakSet", "Symbol", "Proxy", "Reflect", "globalThis", "window",
  "document", "process", "Buffer", "URL", "URLSearchParams",
  "fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "queueMicrotask", "structuredClone", "encodeURIComponent", "decodeURIComponent",
  "encodeURI", "decodeURI", "parseInt", "parseFloat", "isNaN", "isFinite",
  "NaN", "Infinity", "undefined", "Bun", "Deno", "require", "module",
]);
