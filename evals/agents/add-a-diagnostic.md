# Agent Eval: add-a-diagnostic

**Task**: Add TW094 -- "cache tag contains invalid characters" -- for
`cache { tag "a b!" }`.

**Pass criteria (rubric, all required)**:
1. codes.ts has TW094 with message, severity, category.
2. rules.ts implements the check; the parser emits it.
3. errors.json regenerated (count == 94).
4. docs/error-reference.md has the entry with a fix example.
5. One test where it fires, one where `tag "products"` stays silent.
6. `bun test && bun run lint` green.
