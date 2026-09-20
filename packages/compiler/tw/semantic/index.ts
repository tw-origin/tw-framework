/** Semantic analysis barrel -- re-exports everything. */

// Original (simple) implementations -- kept for backward compatibility

// Deep implementations (Batch 5)

export { check } from "./checker";
export type { CheckResult, SemanticError } from "./checker";
export { createInferenceContext, inferNode, inferProgram } from "./inference-deep";
export type { InferenceContext, InferenceDiagnostic } from "./inference-deep";
export { inferArrayType, inferLiteralType, inferNodeType, inferValueType } from "./inference";
export { resolveReferences } from "./resolver";
export type { ResolutionResult, ResolvedReference } from "./resolver";
export { addBinding, analyzeDefiniteAssignment, buildScopeTree, createGlobalScope, createModuleScope, createScope, findCapturedBindings, findShadowedBindings, findTDZViolations, findUnusedBindings, getAllBindings, getBindingsInScope, getEnclosingFunctionScope, getEnclosingLoopScope, getExportedBindings, getImportedBindings, getScopeChain, lookup, lookupInScope, lookupIncludingGlobals, scopeToString } from "./scope-deep";
export type { Binding, BindingKind, Scope, ScopeKind } from "./scope-deep";
export { SymbolTable, buildSymbolTable } from "./symbol-table";
export type { Reference, SymbolEntry, SymbolKind } from "./symbol-table";
export { ANY, BIGINT, BOOLEAN, BUILTIN_TYPES, NEVER, NULL, NUMBER, OBJECT, STRING, SYMBOL, UNDEFINED, UNKNOWN, VOID, arrayType, booleanLiteral, conditionalType, createTypeMismatchError, functionType, genericType, getCommonSupertype, getPropertyType, getTruthiness, hasProperty, inferFromValue, intersectionType, isAny, isArray, isAssignableTo, isBoolean, isConditional, isFunction, isIntersection, isLiteral, isMapped, isNever, isNull, isNumber, isNumericLiteral, isObject, isPrimitive, isReference, isString, isStringLiteralValue, isTemplate, isTuple, isUndefined, isUnion, isUnknown, isVoid, literalType, mappedType, narrowType, numberLiteral, objectType, referenceType, resolveConditional, stringLiteral, substituteTypeParams, templateType, tupleType, typeEquals, typeToString, unifyTypes, unionType, widenType } from "./type-system-deep";
export type { FunctionSig, NarrowCondition, ParamSig, PropertySig, TWTypeNode, TemplatePart, TypeKind, TypeParam } from "./type-system-deep";
export { isAssignable, parseType, unify } from "./type-system";
export type { TWType, TypeConstraint } from "./type-system";
export { validate } from "./validator";
export { validate as validateSemantics } from "./validator";
