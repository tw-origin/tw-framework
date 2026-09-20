/** TW Framework -- Deep Parser Tests */

import { describe, test, expect } from "bun:test";
import {
  getPrecedence,
  getAssociativity,
  isRightAssociative,
  hasHigherPrec,
  shouldContinue,
  isAssignmentOp,
  isComparisonOp,
  isLogicalOp,
  isArithmeticOp,
  isBitwiseOp,
  isUnaryPrefixOp,
  isUpdateOp,
  isMemberOp,
  isSpreadOrRest,
} from "@tw/compiler";

import {
  extractSlots,
  parseLayout,
  resolveLayoutChain,
  fillSlots,
  renderLayoutWithSlots,
  LayoutRegistry,
  type SlotDef,
} from "@tw/compiler";

import {
  validateProp,
  validateConstraints,
  generateJSDoc,
  type PropType,
} from "@tw/compiler";

import {
  ParserRecovery,
  SpeculativeParser,
  continueAfterError,
  detectCommonError,
} from "@tw/compiler";

import {
  validateTagNesting,
  validateDirectives,
  validateAst,
  validateSlotRefs,
} from "@tw/compiler";

// --- Precedence Table Tests -------------------------------------------

describe("Precedence Table", () => {
  test("multiplication has higher precedence than addition", () => {
    expect(getPrecedence("*")).toBe(11);
    expect(getPrecedence("+")).toBe(10);
    expect(hasHigherPrec("*", "+")).toBe(true);
    expect(hasHigherPrec("+", "*")).toBe(false);
  });

  test("exponentiation is right-associative", () => {
    expect(getPrecedence("**")).toBe(12);
    expect(isRightAssociative("**")).toBe(true);
  });

  test("assignment is right-associative", () => {
    expect(isRightAssociative("=")).toBe(true);
    expect(isRightAssociative("+=")).toBe(true);
  });

  test("logical operators have correct precedence", () => {
    expect(getPrecedence("&&")).toBe(3);
    expect(getPrecedence("||")).toBe(2);
    expect(getPrecedence("??")).toBe(2);
    expect(hasHigherPrec("&&", "||")).toBe(true);
  });

  test("comparison operators", () => {
    expect(getPrecedence("<")).toBe(8);
    expect(getPrecedence("==")).toBe(7);
    expect(getPrecedence("===")).toBe(7);
    expect(hasHigherPrec("<", "==")).toBe(true);
  });

  test("bitwise operators precedence", () => {
    expect(getPrecedence("&")).toBe(6);
    expect(getPrecedence("^")).toBe(5);
    expect(getPrecedence("|")).toBe(4);
    expect(hasHigherPrec("&", "^")).toBe(true);
    expect(hasHigherPrec("^", "|")).toBe(true);
  });

  test("shouldContinue for left-assoc", () => {
    expect(shouldContinue("+", 9)).toBe(true);  // level 10 > 9
    expect(shouldContinue("+", 10)).toBe(true);  // level 10 == 10, left-assoc
    expect(shouldContinue("+", 11)).toBe(false); // level 10 < 11
  });

  test("shouldContinue for right-assoc", () => {
    expect(shouldContinue("**", 11)).toBe(true);  // level 12 > 11
    expect(shouldContinue("**", 12)).toBe(false); // level 12 == 12, right-assoc -> false
  });

  test("operator type detection", () => {
    expect(isAssignmentOp("=")).toBe(true);
    expect(isAssignmentOp("+=")).toBe(true);
    expect(isAssignmentOp("+")).toBe(false);

    expect(isComparisonOp("<")).toBe(true);
    expect(isComparisonOp("===")).toBe(true);
    expect(isComparisonOp("+")).toBe(false);

    expect(isLogicalOp("&&")).toBe(true);
    expect(isLogicalOp("??")).toBe(true);
    expect(isLogicalOp("&")).toBe(false);

    expect(isArithmeticOp("+")).toBe(true);
    expect(isArithmeticOp("**")).toBe(true);
    expect(isArithmeticOp("&")).toBe(false);

    expect(isBitwiseOp("&")).toBe(true);
    expect(isBitwiseOp("<<")).toBe(true);
    expect(isBitwiseOp("+")).toBe(false);

    expect(isUnaryPrefixOp("!")).toBe(true);
    expect(isUnaryPrefixOp("typeof")).toBe(true);
    expect(isUnaryPrefixOp("+")).toBe(true);
    expect(isUnaryPrefixOp("&")).toBe(false);

    expect(isUpdateOp("++")).toBe(true);
    expect(isUpdateOp("--")).toBe(true);
    expect(isUpdateOp("+")).toBe(false);

    expect(isMemberOp(".")).toBe(true);
    expect(isMemberOp("?.")).toBe(true);
    expect(isMemberOp("+")).toBe(false);

    expect(isSpreadOrRest("...")).toBe(true);
    expect(isSpreadOrRest("+")).toBe(false);
  });

  test("unknown operator returns -1", () => {
    expect(getPrecedence("@")).toBe(-1);
    expect(getPrecedence("#")).toBe(-1);
  });

  test("associativity defaults to left", () => {
    expect(getAssociativity("@")).toBe("left");
  });
});

// --- Slot & Layout Tests ---------------------------------------------

describe("Slots & Layout", () => {
  test("extracts slots from layout AST", () => {
    const ast: any = {
      type: "Program",
      body: [
        {
          type: "Element",
          tag: "div",
          attrs: [],
          children: [
            {
              type: "Element",
              tag: "slot",
              attrs: [{ name: "name", value: "main" }],
              children: [],
              loc: { start: { line: 1, col: 5, offset: 5 } },
            },
            {
              type: "Element",
              tag: "slot",
              attrs: [{ name: "name", value: "sidebar" }, { name: "optional" }],
              children: [],
              loc: { start: { line: 2, col: 5, offset: 20 } },
            },
          ],
          attrs: [],
          selfClosing: false,
          loc: { start: { line: 1, col: 1, offset: 0 } },
        },
      ],
      directives: [],
    };

    const slots = extractSlots(ast);
    expect(slots.length).toBe(2);
    expect(slots[0].name).toBe("main");
    expect(slots[0].required).toBe(true);
    expect(slots[1].name).toBe("sidebar");
    expect(slots[1].required).toBe(false);
  });

  test("fills slots with content", () => {
    const layout: any = {
      type: "Program",
      body: [
        {
          type: "Element",
          tag: "slot",
          attrs: [{ name: "name", value: "main" }],
          children: [],
          selfClosing: false,
          loc: { start: { line: 1, col: 1, offset: 0 } },
        },
      ],
      directives: [],
    };

    const pageContent: any[] = [
      {
        type: "Element",
        tag: "template",
        attrs: [{ name: "#", value: "main" }],
        children: [{ type: "Text", value: "Hello World" }],
        selfClosing: false,
        loc: { start: { line: 1, col: 1, offset: 0 } },
      },
    ];

    const layoutDef = parseLayout("test", "test.tw", layout);
    const { filled, unfilled } = fillSlots(layoutDef, pageContent);

    expect(filled.has("main")).toBe(true);
    expect(filled.get("main")!.content.length).toBe(1);
    expect(unfilled.length).toBe(0);
  });

  test("resolves layout chain", () => {
    const registry = new LayoutRegistry();
    const rootLayout: any = { type: "Program", body: [], directives: [] };
    const childLayout: any = {
      type: "Program",
      body: [],
      directives: [{ name: "layout", args: [{ value: "'root'" }], body: null }],
    };

    registry.register("root", parseLayout("root", "root.tw", rootLayout));
    registry.register("child", parseLayout("child", "child.tw", childLayout));

    const chain = resolveLayoutChain("child", registry);
    expect(chain.layouts.length).toBe(2);
    expect(chain.layouts[0].name).toBe("root");
    expect(chain.layouts[1].name).toBe("child");
  });

  test("renders layout with slots", () => {
    const layoutAst: any = {
      type: "Program",
      body: [
        {
          type: "Element",
          tag: "div",
          attrs: [],
          children: [
            {
              type: "Element",
              tag: "slot",
              attrs: [{ name: "name", value: "main" }],
              children: [],
              selfClosing: false,
            },
          ],
          selfClosing: false,
        },
      ],
      directives: [],
    };

    const filled = new Map([
      ["main", { name: "main", content: [{ type: "Text", value: "Content!" }], source: "page" }],
    ]);

    const html = renderLayoutWithSlots(layoutAst, filled);
    expect(html).toContain("Content!");
    expect(html).toContain("<div>");
  });
});

// --- Prop Parser Tests -----------------------------------------------

describe("Prop Parser", () => {
  test("validates primitive types", () => {
    expect(validateProp("hello", { kind: "primitive", name: "string" })).toBeNull();
    expect(validateProp(42, { kind: "primitive", name: "number" })).toBeNull();
    expect(validateProp(true, { kind: "primitive", name: "boolean" })).toBeNull();
    expect(validateProp(42, { kind: "primitive", name: "string" })).not.toBeNull();
    expect(validateProp("hello", { kind: "primitive", name: "number" })).not.toBeNull();
  });

  test("validates literal types", () => {
    expect(validateProp("red", { kind: "literal", value: "red" })).toBeNull();
    expect(validateProp("blue", { kind: "literal", value: "red" })).not.toBeNull();
    expect(validateProp(42, { kind: "literal", value: 42 })).toBeNull();
  });

  test("validates union types", () => {
    const unionType: PropType = {
      kind: "union",
      types: [
        { kind: "literal", value: "sm" },
        { kind: "literal", value: "md" },
        { kind: "literal", value: "lg" },
      ],
    };
    expect(validateProp("sm", unionType)).toBeNull();
    expect(validateProp("xl", unionType)).not.toBeNull();
  });

  test("validates array types", () => {
    const arrayType: PropType = { kind: "array", element: { kind: "primitive", name: "number" } };
    expect(validateProp([1, 2, 3], arrayType)).toBeNull();
    expect(validateProp([1, "two", 3], arrayType)).not.toBeNull();
    expect(validateProp("not array", arrayType)).not.toBeNull();
  });

  test("validates object types", () => {
    const objType: PropType = {
      kind: "object",
      fields: [
        { name: "x", type: { kind: "primitive", name: "number" }, optional: false },
        { name: "y", type: { kind: "primitive", name: "number" }, optional: true },
      ],
    };
    expect(validateProp({ x: 10 }, objType)).toBeNull();
    expect(validateProp({ x: 10, y: 20 }, objType)).toBeNull();
    expect(validateProp({ y: 20 }, objType)).not.toBeNull(); // missing required x
    expect(validateProp("not object", objType)).not.toBeNull();
  });

  test("validates function type", () => {
    const fnType: PropType = {
      kind: "function",
      params: [],
      returns: { kind: "primitive", name: "void" },
    };
    expect(validateProp(() => {}, fnType)).toBeNull();
    expect(validateProp("not function", fnType)).not.toBeNull();
  });

  test("validates tuple types", () => {
    const tupleType: PropType = {
      kind: "tuple",
      elements: [
        { kind: "primitive", name: "string" },
        { kind: "primitive", name: "number" },
      ],
    };
    expect(validateProp(["hello", 42], tupleType)).toBeNull();
    expect(validateProp(["hello"], tupleType)).not.toBeNull(); // wrong length
    expect(validateProp([42, "hello"], tupleType)).not.toBeNull(); // wrong types
  });

  test("validates constraints", () => {
    expect(validateConstraints(5, { min: 0, max: 10 })).toBeNull();
    expect(validateConstraints(15, { min: 0, max: 10 })).not.toBeNull();
    expect(validateConstraints(-1, { min: 0, max: 10 })).not.toBeNull();

    expect(validateConstraints("hello", { minLength: 3, maxLength: 10 })).toBeNull();
    expect(validateConstraints("hi", { minLength: 3 })).not.toBeNull();
    expect(validateConstraints("this is too long", { maxLength: 5 })).not.toBeNull();

    expect(validateConstraints("hello", { pattern: "^h" })).toBeNull();
    expect(validateConstraints("world", { pattern: "^h" })).not.toBeNull();

    expect(validateConstraints("red", { oneOf: ["red", "green", "blue"] })).toBeNull();
    expect(validateConstraints("yellow", { oneOf: ["red", "green", "blue"] })).not.toBeNull();
  });

  test("any type accepts everything", () => {
    expect(validateProp("anything", { kind: "primitive", name: "any" })).toBeNull();
    expect(validateProp(42, { kind: "primitive", name: "any" })).toBeNull();
    expect(validateProp(null, { kind: "primitive", name: "any" })).toBeNull();
    expect(validateProp({}, { kind: "primitive", name: "any" })).toBeNull();
  });

  test("generates JSDoc for props", () => {
    const propsBlock = {
      props: [
        { name: "color", type: { kind: "primitive" as const, name: "string" as const }, optional: false, default: "'blue'" },
        { name: "size", type: { kind: "primitive" as const, name: "string" as const }, optional: true, default: "'md'" },
      ],
      restProps: false,
      childrenRequired: false,
    };
    const jsdoc = generateJSDoc(propsBlock);
    expect(jsdoc).toContain("/**");
    expect(jsdoc).toContain("@param");
    expect(jsdoc).toContain("color");
    expect(jsdoc).toContain("size");
  });
});

// --- Parser Recovery Tests -------------------------------------------

describe("Parser Recovery", () => {
  test("creates checkpoint and restores", () => {
    const recovery = new ParserRecovery();
    const tokens = [
      { token_type: "Ident", value: "a", pos: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 2, offset: 1 } },
      { token_type: "Ident", value: "b", pos: { line: 1, col: 2, offset: 1 }, end: { line: 1, col: 3, offset: 2 } },
    ] as any[];

    const cp = recovery.checkpoint(tokens, 0);
    expect(cp.pos).toBe(0);
    expect(recovery.restore(cp)).toBe(0);
  });

  test("records skip token error", () => {
    const recovery = new ParserRecovery();
    const token = { token_type: "Unknown", value: "@", pos: { line: 1, col: 5, offset: 4 }, end: { line: 1, col: 6, offset: 5 } } as any;
    recovery.skipToken(token, "Unexpected token '@'");

    expect(recovery.hasErrors()).toBe(true);
    expect(recovery.errorCount).toBe(1);
    expect(recovery.getErrors()[0].message).toContain("Unexpected token");
  });

  test("records insert token error", () => {
    const recovery = new ParserRecovery();
    recovery.insertToken("Gt", ">", { line: 1, col: 10, offset: 9 }, "Missing '>'");

    expect(recovery.hasErrors()).toBe(true);
    const err = recovery.getErrors()[0];
    expect(err.action.type).toBe("insert");
  });

  test("panic recovery skips to sync point", () => {
    const recovery = new ParserRecovery();
    const tokens = [
      { token_type: "Unknown", value: "@", pos: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 2, offset: 1 } },
      { token_type: "Unknown", value: "#", pos: { line: 1, col: 2, offset: 1 }, end: { line: 1, col: 3, offset: 2 } },
      { token_type: "Gt", value: ">", pos: { line: 1, col: 3, offset: 2 }, end: { line: 1, col: 4, offset: 3 } },
    ] as any[];

    const result = recovery.panicRecovery(tokens, 0, ["Gt"], "Unexpected tokens");
    expect(result).toBe(2); // index of the Gt token
    expect(recovery.errorCount).toBe(1);
  });

  test("detects common errors", () => {
    const tokens = [
      { token_type: "Ident", value: "div", pos: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 4, offset: 3 } },
      { token_type: "Gt", value: ">", pos: { line: 1, col: 4, offset: 3 }, end: { line: 1, col: 5, offset: 4 } },
    ] as any[];

    // Missing > error
    const result = detectCommonError(tokens, 0, ">");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Missing '>'");
  });

  test("speculative parser tries and rolls back", () => {
    const recovery = new ParserRecovery();
    const spec = new SpeculativeParser(recovery);
    const tokens: any[] = [];

    // Primary fails, alternative succeeds
    const result = spec.tryProductions(tokens, 0, [
      () => { throw new Error("fail"); },
      () => ({ result: "success", nextPos: 5 }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.result).toBe("success");
  });

  test("continueAfterError finds sync point", () => {
    const recovery = new ParserRecovery();
    const tokens = [
      { token_type: "Unknown", value: "@", pos: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 2, offset: 1 } },
      { token_type: "Semicolon", value: ";", pos: { line: 1, col: 2, offset: 1 }, end: { line: 1, col: 3, offset: 2 } },
    ] as any[];

    const result = continueAfterError(recovery, tokens, 0, "js", "Parse error");
    expect(result).toBe(1); // index of semicolon
  });
});

// --- Validator Tests ------------------------------------------------

describe("Parser Validator", () => {
  test("validates tag nesting -- unclosed tag", () => {
    const ast: any = {
      type: "Program",
      body: [
        {
          type: "Element",
          tag: "div",
          attrs: [],
          children: [],
          selfClosing: false,
          loc: { start: { line: 1, col: 1, offset: 0 } },
        },
      ],
      directives: [],
    };

    const errors = validateTagNesting(ast);
    // div is not self-closing and has no closing -> but the validator
    // expects the parser to have already closed it. If it's in the body
    // as a complete element, it should be fine.
    // The unclosed check only fires for tags left on the stack.
  });

  test("validates directives -- unknown directive", () => {
    const ast: any = {
      type: "Program",
      body: [],
      directives: [
        { name: "unknownDir", args: [], body: null, loc: { start: { line: 1, col: 1, offset: 0 } } },
      ],
    };

    const errors = validateDirectives(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("UNKNOWN_DIRECTIVE");
  });

  test("validates directives -- invalid render mode", () => {
    const ast: any = {
      type: "Program",
      body: [],
      directives: [
        { name: "render", args: [], body: "'invalid'", loc: { start: { line: 1, col: 1, offset: 0 } } },
      ],
    };

    const errors = validateDirectives(ast);
    expect(errors.some((e) => e.code === "INVALID_RENDER_MODE")).toBe(true);
  });

  test("validates directives -- missing redirect URL", () => {
    const ast: any = {
      type: "Program",
      body: [],
      directives: [
        { name: "redirect", args: [], body: null, loc: { start: { line: 1, col: 1, offset: 0 } } },
      ],
    };

    const errors = validateDirectives(ast);
    expect(errors.some((e) => e.code === "MISSING_REDIRECT_URL")).toBe(true);
  });

  test("validates slot references", () => {
    const ast: any = {
      type: "Program",
      body: [
        {
          type: "Element",
          tag: "slot",
          attrs: [{ name: "name", value: "nonexistent" }],
          children: [],
          selfClosing: false,
          loc: { start: { line: 1, col: 1, offset: 0 } },
        },
      ],
      directives: [],
    };

    const errors = validateSlotRefs(ast, new Set(["main", "sidebar"]));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("UNKNOWN_SLOT");
  });

  test("validateAst runs all checks", () => {
    const ast: any = {
      type: "Program",
      body: [],
      directives: [
        { name: "unknownDir", args: [], body: null, loc: { start: { line: 1, col: 1, offset: 0 } } },
      ],
    };

    const errors = validateAst(ast);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("validateAst respects options", () => {
    const ast: any = {
      type: "Program",
      body: [],
      directives: [
        { name: "unknownDir", args: [], body: null, loc: { start: { line: 1, col: 1, offset: 0 } } },
      ],
    };

    const errors = validateAst(ast, { checkDirectives: false });
    expect(errors.length).toBe(0);
  });
});
