import { describe, test, expect } from "bun:test";
import {
  STRING, NUMBER, BOOLEAN, NULL, UNDEFINED, ANY, UNKNOWN, NEVER, VOID,
  literalType, stringLiteral, numberLiteral, booleanLiteral,
  unionType, intersectionType, arrayType, tupleType, objectType,
  functionType, genericType, conditionalType,
  isAssignableTo, unifyTypes, widenType, typeEquals, typeToString,
  narrowType, getTruthiness, hasProperty, getPropertyType,
  substituteTypeParams,
} from "../packages/compiler/tw/semantic/type-system-deep";
import {
  createScope, addBinding, lookup, buildScopeTree,
  findUnusedBindings, findShadowedBindings, findTDZViolations,
  scopeToString,
} from "../packages/compiler/tw/semantic/scope-deep";
import {
  createInferenceContext, inferNode,
} from "../packages/compiler/tw/semantic/inference-deep";
import { check } from "../packages/compiler/tw/semantic/checker";

// --- Type System Tests ------------------------------------------------

describe("Type System -- Type Constructors", () => {
  test("literal types", () => {
    expect(stringLiteral("hello").kind).toBe("literal");
    expect(stringLiteral("hello").value).toBe("hello");
    expect(numberLiteral(42).value).toBe(42);
    expect(booleanLiteral(true).value).toBe(true);
  });

  test("union types flatten and dedup", () => {
    const u = unionType([STRING, unionType([NUMBER, STRING])]);
    expect(u.kind).toBe("union");
    expect(u.members!.length).toBe(2);
  });

  test("union with never absorbs never", () => {
    const u = unionType([STRING, NEVER]);
    expect(u).toBe(STRING);
  });

  test("intersection with any returns any", () => {
    const i = intersectionType([STRING, ANY]);
    expect(i).toBe(ANY);
  });

  test("intersection merges objects", () => {
    const a = objectType([
      { name: "x", type: NUMBER, optional: false, readonly: false },
    ]);
    const b = objectType([
      { name: "y", type: STRING, optional: false, readonly: false },
    ]);
    const i = intersectionType([a, b]);
    expect(i.kind).toBe("object");
    expect(i.properties!.size).toBe(2);
    expect(i.properties!.has("x")).toBe(true);
    expect(i.properties!.has("y")).toBe(true);
  });

  test("array type", () => {
    const arr = arrayType(STRING);
    expect(arr.kind).toBe("array");
    expect(arr.elements![0]).toBe(STRING);
  });

  test("tuple type preserves order", () => {
    const t = tupleType([STRING, NUMBER, BOOLEAN]);
    expect(t.kind).toBe("tuple");
    expect(t.elements!.length).toBe(3);
  });

  test("function type with params", () => {
    const fn = functionType(
      [{ name: "x", type: NUMBER, optional: false, defaultValue: false }],
      STRING
    );
    expect(fn.kind).toBe("function");
    expect(fn.sig!.params.length).toBe(1);
    expect(fn.sig!.returnType).toBe(STRING);
  });

  test("conditional type", () => {
    const cond = conditionalType(STRING, STRING, NUMBER, BOOLEAN);
    expect(cond.kind).toBe("conditional");
    expect(cond.checkType).toBe(STRING);
  });
});

describe("Type System -- Assignability", () => {
  test("any is assignable to/from everything", () => {
    expect(isAssignableTo(ANY, STRING)).toBe(true);
    expect(isAssignableTo(STRING, ANY)).toBe(true);
    expect(isAssignableTo(ANY, ANY)).toBe(true);
  });

  test("never is assignable to everything", () => {
    expect(isAssignableTo(NEVER, STRING)).toBe(true);
    expect(isAssignableTo(NEVER, NUMBER)).toBe(true);
  });

  test("unknown only assignable to unknown/any", () => {
    expect(isAssignableTo(UNKNOWN, UNKNOWN)).toBe(true);
    expect(isAssignableTo(UNKNOWN, ANY)).toBe(true);
    expect(isAssignableTo(UNKNOWN, STRING)).toBe(false);
  });

  test("literal assignable to base type", () => {
    expect(isAssignableTo(stringLiteral("foo"), STRING)).toBe(true);
    expect(isAssignableTo(numberLiteral(42), NUMBER)).toBe(true);
    expect(isAssignableTo(booleanLiteral(true), BOOLEAN)).toBe(true);
  });

  test("literal not assignable to different type", () => {
    expect(isAssignableTo(stringLiteral("foo"), NUMBER)).toBe(false);
    expect(isAssignableTo(numberLiteral(42), STRING)).toBe(false);
  });

  test("union source: all members must be assignable", () => {
    expect(isAssignableTo(unionType([STRING, NUMBER]), ANY)).toBe(true);
    expect(isAssignableTo(unionType([STRING, NUMBER]), STRING)).toBe(false);
  });

  test("union target: source must match at least one", () => {
    expect(isAssignableTo(STRING, unionType([STRING, NUMBER]))).toBe(true);
    expect(isAssignableTo(BOOLEAN, unionType([STRING, NUMBER]))).toBe(false);
  });

  test("array covariance", () => {
    expect(isAssignableTo(arrayType(STRING), arrayType(ANY))).toBe(true);
    expect(isAssignableTo(arrayType(STRING), arrayType(NUMBER))).toBe(false);
  });

  test("object structural assignability", () => {
    const source = objectType([
      { name: "x", type: NUMBER, optional: false, readonly: false },
      { name: "y", type: STRING, optional: false, readonly: false },
    ]);
    const target = objectType([
      { name: "x", type: NUMBER, optional: false, readonly: false },
    ]);
    expect(isAssignableTo(source, target)).toBe(true);
    expect(isAssignableTo(target, source)).toBe(false);
  });

  test("optional properties", () => {
    const source = objectType([
      { name: "x", type: NUMBER, optional: false, readonly: false },
    ]);
    const target = objectType([
      { name: "x", type: NUMBER, optional: true, readonly: false },
      { name: "y", type: STRING, optional: true, readonly: false },
    ]);
    expect(isAssignableTo(source, target)).toBe(true);
  });
});

describe("Type System -- Unification", () => {
  test("unify same types", () => {
    expect(unifyTypes(STRING, STRING)).toBe(STRING);
  });

  test("unify never with T returns T", () => {
    expect(unifyTypes(NEVER, STRING)).toBe(STRING);
    expect(unifyTypes(STRING, NEVER)).toBe(STRING);
  });

  test("unify literal with base returns union", () => {
    const result = unifyTypes(stringLiteral("a"), stringLiteral("b"));
    expect(result.kind).toBe("union");
  });

  test("unify arrays", () => {
    const result = unifyTypes(arrayType(STRING), arrayType(NUMBER));
    expect(result.kind).toBe("array");
  });

  test("unify objects merges properties", () => {
    const a = objectType([
      { name: "x", type: NUMBER, optional: false, readonly: false },
    ]);
    const b = objectType([
      { name: "y", type: STRING, optional: false, readonly: false },
    ]);
    const result = unifyTypes(a, b);
    expect(result.kind).toBe("object");
    expect(result.properties!.size).toBe(2);
  });
});

describe("Type System -- Widening", () => {
  test("widen literal to base", () => {
    expect(widenType(stringLiteral("hello"))).toBe(STRING);
    expect(widenType(numberLiteral(42))).toBe(NUMBER);
    expect(widenType(booleanLiteral(true))).toBe(BOOLEAN);
  });

  test("widen union of literals", () => {
    const u = unionType([stringLiteral("a"), stringLiteral("b")]);
    const widened = widenType(u);
    expect(widened).toBe(STRING);
  });
});

describe("Type System -- Narrowing", () => {
  test("narrow truthy removes null/undefined", () => {
    const t = unionType([STRING, NULL, UNDEFINED]);
    const narrowed = narrowType(t, { kind: "truthy" });
    expect(narrowed).toBe(STRING);
  });

  test("narrow falsy keeps only null/undefined", () => {
    const t = unionType([STRING, NULL, UNDEFINED]);
    const narrowed = narrowType(t, { kind: "falsy" });
    expect(narrowed.kind).toBe("union");
    expect(narrowed.members!.length).toBe(2);
  });

  test("narrow typeof string", () => {
    const t = unionType([STRING, NUMBER, BOOLEAN]);
    const narrowed = narrowType(t, { kind: "typeof", typeName: "string" });
    expect(narrowed).toBe(STRING);
  });

  test("narrow equals literal", () => {
    const t = unionType([stringLiteral("a"), stringLiteral("b")]);
    const narrowed = narrowType(t, { kind: "equals", value: "a" });
    expect(narrowed.kind).toBe("literal");
  });
});

describe("Type System -- Truthiness", () => {
  test("null is falsy", () => {
    expect(getTruthiness(NULL)).toBe(false);
  });

  test("undefined is falsy", () => {
    expect(getTruthiness(UNDEFINED)).toBe(false);
  });

  test("literal false is falsy", () => {
    expect(getTruthiness(booleanLiteral(false))).toBe(false);
  });

  test("literal 0 is falsy", () => {
    expect(getTruthiness(numberLiteral(0))).toBe(false);
  });

  test("literal '' is falsy", () => {
    expect(getTruthiness(stringLiteral(""))).toBe(false);
  });

  test("literal 'hello' is truthy", () => {
    expect(getTruthiness(stringLiteral("hello"))).toBe(true);
  });

  test("string type is unknown truthiness", () => {
    expect(getTruthiness(STRING)).toBe(null);
  });
});

describe("Type System -- Property Access", () => {
  test("hasProperty on object", () => {
    const t = objectType([
      { name: "name", type: STRING, optional: false, readonly: false },
    ]);
    expect(hasProperty(t, "name")).toBe(true);
    expect(hasProperty(t, "age")).toBe(false);
  });

  test("getPropertyType", () => {
    const t = objectType([
      { name: "age", type: NUMBER, optional: false, readonly: false },
    ]);
    expect(getPropertyType(t, "age")).toBe(NUMBER);
    expect(getPropertyType(t, "name")).toBe(null);
  });

  test("hasProperty on intersection", () => {
    const a = objectType([
      { name: "x", type: NUMBER, optional: false, readonly: false },
    ]);
    const b = objectType([
      { name: "y", type: STRING, optional: false, readonly: false },
    ]);
    const i = intersectionType([a, b]);
    expect(hasProperty(i, "x")).toBe(true);
    expect(hasProperty(i, "y")).toBe(true);
  });
});

describe("Type System -- Substitution", () => {
  test("substitute type param", () => {
    const ref = { kind: "reference" as const, refName: "T" };
    const subst = new Map([["T", STRING]]);
    const result = substituteTypeParams(ref, subst);
    expect(result).toBe(STRING);
  });

  test("substitute in array", () => {
    const ref = { kind: "reference" as const, refName: "T" };
    const arr = arrayType(ref);
    const subst = new Map([["T", STRING]]);
    const result = substituteTypeParams(arr, subst);
    expect(result.elements![0]).toBe(STRING);
  });
});

describe("Type System -- Pretty Printing", () => {
  test("primitive to string", () => {
    expect(typeToString(STRING)).toBe("string");
    expect(typeToString(NUMBER)).toBe("number");
    expect(typeToString(BOOLEAN)).toBe("boolean");
  });

  test("literal to string", () => {
    expect(typeToString(stringLiteral("hello"))).toBe('"hello"');
    expect(typeToString(numberLiteral(42))).toBe("42");
    expect(typeToString(booleanLiteral(true))).toBe("true");
  });

  test("union to string", () => {
    const u = unionType([STRING, NUMBER]);
    expect(typeToString(u)).toBe("string | number");
  });

  test("array to string", () => {
    expect(typeToString(arrayType(STRING))).toBe("string[]");
  });

  test("object to string", () => {
    const t = objectType([
      { name: "name", type: STRING, optional: false, readonly: false },
      { name: "age", type: NUMBER, optional: true, readonly: false },
    ]);
    const s = typeToString(t);
    expect(s).toContain("name: string");
    expect(s).toContain("age?: number");
  });
});

// --- Scope Tree Tests --------------------------------------------------

describe("Scope Tree -- Basic Operations", () => {
  test("create scope", () => {
    const scope = createScope("global", "global");
    expect(scope.kind).toBe("global");
    expect(scope.name).toBe("global");
    expect(scope.parent).toBe(null);
    expect(scope.bindings.size).toBe(0);
  });

  test("add and lookup binding", () => {
    const scope = createScope("global", "global");
    addBinding(scope, {
      name: "x", kind: "let", type: "string",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 1, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    const binding = lookup(scope, "x");
    expect(binding).not.toBe(null);
    expect(binding!.name).toBe("x");
    expect(binding!.type).toBe("string");
  });

  test("lookup traverses parent chain", () => {
    const parent = createScope("global", "global");
    const child = createScope("function", "foo", parent);
    addBinding(parent, {
      name: "globalVar", kind: "var", type: "number",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 1, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    expect(lookup(child, "globalVar")).not.toBe(null);
  });

  test("shadowing: child binding hides parent", () => {
    const parent = createScope("global", "global");
    const child = createScope("block", "if", parent);
    addBinding(parent, {
      name: "x", kind: "let", type: "string",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 1, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    addBinding(child, {
      name: "x", kind: "let", type: "number",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 2, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    const binding = lookup(child, "x");
    expect(binding!.type).toBe("number");
    expect(binding!.scope).toBe(child);
  });
});

describe("Scope Tree -- Analysis", () => {
  test("find unused bindings", () => {
    const scope = createScope("global", "global");
    addBinding(scope, {
      name: "unused", kind: "let", type: "string",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 1, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    addBinding(scope, {
      name: "used", kind: "let", type: "string",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 2, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    // Add a reference to "used"
    const usedBinding = lookup(scope, "used");
    usedBinding!.references.push({ line: 3, col: 0, kind: "read" });

    const unused = findUnusedBindings(scope);
    expect(unused.length).toBe(1);
    expect(unused[0].name).toBe("unused");
  });

  test("find shadowed bindings", () => {
    const parent = createScope("global", "global");
    addBinding(parent, {
      name: "x", kind: "let", type: "string",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 1, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    const child = createScope("block", "if", parent);
    parent.children.push(child);
    addBinding(child, {
      name: "x", kind: "let", type: "number",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 2, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });

    const shadows = findShadowedBindings(parent);
    expect(shadows.length).toBe(1);
    expect(shadows[0].binding.name).toBe("x");
    expect(shadows[0].shadowed.name).toBe("x");
  });

  test("TDZ violation detection", () => {
    const scope = createScope("global", "global");
    addBinding(scope, {
      name: "x", kind: "let", type: "string",
      isExported: false, isImported: false, isMutable: true,
      initialized: true, declarationLine: 5, declarationCol: 0,
      hoisted: false, captured: false, isConst: false, isAsync: false, isGenerator: false,
    });
    // Add a reference before declaration
    const binding = lookup(scope, "x");
    binding!.references.push({ line: 2, col: 0, kind: "read" });

    const violations = findTDZViolations(scope);
    expect(violations.length).toBe(1);
    expect(violations[0].name).toBe("x");
    expect(violations[0].line).toBe(2);
  });
});

// --- Checker Tests -----------------------------------------------------

describe("Semantic Checker -- Basic Checks", () => {
  test("check catches undefined variables", () => {
    const program: any = {
      type: "Program",
      body: [{
        type: "Element",
        tag: "div",
        attrs: [{
          name: "class",
          value: "${undefinedVar}",
          isInterpolated: true,
          line: 1, col: 0,
        }],
        bindings: [],
        children: [],
        line: 1, col: 0,
      }],
      directives: [],
    };
    const result = check(program);
    const undefinedErrors = result.errors.filter(e => e.code === "TW021");
    expect(undefinedErrors.length).toBeGreaterThan(0);
  });

  test("check catches duplicate components", () => {
    const program: any = {
      type: "Program",
      body: [
        { type: "Component", name: "MyComp", props: [], children: [], line: 1, col: 0 },
        { type: "Component", name: "MyComp", props: [], children: [], line: 2, col: 0 },
      ],
      directives: [],
    };
    const result = check(program);
    const dupErrors = result.errors.filter(e => e.code === "TW036");
    expect(dupErrors.length).toBe(1);
  });

  test("check catches empty bindings", () => {
    const program: any = {
      type: "Program",
      body: [{
        type: "Element",
        tag: "div",
        attrs: [],
        bindings: [{
          property: "text",
          expression: "",
          line: 1, col: 0,
        }],
        children: [],
        line: 1, col: 0,
      }],
      directives: [],
    };
    const result = check(program);
    const emptyErrors = result.errors.filter(e => e.code === "TW032");
    expect(emptyErrors.length).toBe(1);
  });

  test("check catches unused imports", () => {
    const program: any = {
      type: "Program",
      body: [],
      directives: [{
        type: "ImportDirective",
        items: ["unusedImport"],
        line: 1, col: 0,
      }],
    };
    const result = check(program);
    const unusedInfo = result.infos.filter(e => e.code === "TW025");
    expect(unusedInfo.length).toBe(1);
  });

  test("check returns error count", () => {
    const program: any = {
      type: "Program",
      body: [],
      directives: [],
    };
    const result = check(program);
    expect(typeof result.errorCount).toBe("number");
    expect(result.errorCount).toBe(0);
  });
});
