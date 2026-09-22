# Agent Eval: cut-a-release

**Task**: Bump 1.0.6 -> 1.0.7 and produce the zip.

**Pass criteria (rubric, all required)**:
1. All THREE version files bumped; `<meta name="generator">` shows 1.0.7.
2. bun test green, lint clean.
3. Zip excludes node_modules and .tw.
4. Fresh-verify performed on the zip contents (not the working tree).
5. UPGRADING.md untouched (no breaking change -> no note).
