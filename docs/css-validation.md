# CSS Validation — What Is Checked, and What Is Not

`tw check` validates stylesheets in two passes. Both report `file:line:column`.

## Pass 1 — structure (always on, no dependency)

| code | severity | what it catches |
|---|---|---|
| TW303 | error | unbalanced braces |
| TW306 | error | a declaration without a colon in a `.css` file |
| TW307 | error | a declaration with an empty value |
| TW308 | **warning** | an unrecognized at-rule |

These need no third-party package and run on every project.

TW308 is a warning because no at-rule list can be complete — Tailwind v4's
`@theme`/`@utility`/`@variant` and whatever ships next would otherwise fail a
build that is perfectly valid.

## Pass 2 — values (only when `css-tree` is installed)

| code | severity | what it catches |
|---|---|---|
| TW310 | **warning** | a value that does not match the property's grammar |

The framework does not depend on `css-tree`. If your project has it, `tw check`
finds it and uses it; if not, the pass is skipped and `tw check` prints:

```
! value-level CSS checks skipped (N file(s)): css-tree is not installed.
  structural checks still ran; install css-tree to enable them.
```

`css-tree` is resolved from **your project root**, not from the framework's own
install — so the version you pin is the one that runs.

Validation happens on the CSS **as written**, before scoped-selector rewriting,
so line and column point at the file you edited.

## What pass 2 deliberately does not report

These are not oversights. Each one would produce false positives on valid CSS,
and a checker that cries wolf gets turned off.

**Values containing `var()`, `env()` or `attr()`.** The value is not decidable at
build time, so the whole declaration is skipped.

> **Known limitation:** because the declaration is skipped wholesale, an unknown
> *property* is not reported when its value uses a custom property. `fd: var(--x)`
> produces no finding, while `fd: column` does. Fixing it means checking the
> property name before the value, which is a behaviour change and is not done yet.

**Custom properties (`--*`).** They have no grammar to check against; any value
is legal.

**Descriptors inside at-rules.** `@property { syntax: "<color>"; inherits: false }`
uses `syntax`, `inherits` and `initial-value` — these are descriptors, not CSS
properties. The same applies to `@font-face`, `@counter-style`, `@page`,
`@viewport`, `@font-palette-values` and `@position-try`.

**Anything the lexer says it cannot decide.** css-tree reports "not applicable"
and "not supported" for constructs it has no rule for; those are filtered out.

## Why warning, never error

`css-tree`'s property grammar comes from `mdn-data`, which lags behind the
specs. A property or value that shipped last month can be missing from this
month's data, and a build that fails on that is a build that punishes people for
using new CSS. TW310 is therefore advisory: it points at something worth a look
and never fails `tw check`. Use `--ignore TW310` to silence it for a project.

## Related

- `docs/known-issues.md` — defects that are understood and not fixed yet.
- `docs/error-reference.md` — the full diagnostic list.
