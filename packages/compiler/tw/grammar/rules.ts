/** Grammar rules -- validation rules for TW syntax. */


export interface SyntaxRule {
  name: string;
  description: string;
  check: (token: string, context?: any) => boolean;
}

export const SYNTAX_RULES: SyntaxRule[] = [
  {
    name: "valid-tag-name",
    description: "Tag names must start with a letter and contain only alphanumeric characters and hyphens",
    check: (t) => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(t),
  },
  {
    name: "valid-attr-name",
    description: "Attribute names must contain only alphanumeric characters, hyphens, and colons",
    check: (t) => /^[a-zA-Z_:][a-zA-Z0-9_.:@-]*$/.test(t),
  },
  {
    name: "valid-component-name",
    description: "Component names must be PascalCase",
    check: (t) => /^[A-Z][a-zA-Z0-9]*$/.test(t),
  },
  {
    name: "valid-event-name",
    description: "Event names must be lowercase alphabetic",
    check: (t) => /^[a-z]+$/.test(t),
  },
  {
    name: "valid-css-property",
    description: "CSS properties must be kebab-case or camelCase",
    check: (t) => /^[a-z][a-zA-Z-]*$/.test(t) || t.startsWith("--"),
  },
  {
    name: "valid-variable-name",
    description: "Variable names must be valid JavaScript identifiers",
    check: (t) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(t),
  },
  {
    name: "valid-directive",
    description: "Directives must start with @ and contain only alphabetic characters",
    check: (t) => /^@[a-zA-Z]+$/.test(t),
  },
];

export function validateSyntax(token: string, ruleName: string): boolean {
  const rule = SYNTAX_RULES.find(r => r.name === ruleName);
  if (!rule) return true;
  return rule.check(token);
}

export function getRule(name: string): SyntaxRule | null {
  return SYNTAX_RULES.find(r => r.name === name) ?? null;
}

export function getAllRules(): SyntaxRule[] {
  return SYNTAX_RULES;
}
