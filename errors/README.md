# The Error Registry -- errors.json

This document covers one thing completely: the machine-readable registry of
every TW Framework diagnostic -- what it is, how it is generated, how every
consumer (CLI, LSP, docs, CI) reads it, and how to change it safely.

## What errors.json is

A single JSON document at the repo root, generated from the compiler's
ERROR_CODES table (never hand-edited):

```json
{
  "version": 1,
  "generatedAt": "2026-09-22T04:27:19.580Z",
  "count": 93,
  "codes": {
    "TW001": { "message": "Unexpected token", "severity": "error", "category": "syntax" },
    ...
  }
}
```

The file is the contract between four consumers:

| Consumer | How it uses the registry |
|---|---|
| **The CLI** | decodes TW0xx codes into human text without embedding message strings in every command |
| **The LSP** (packages/lsp) | maps codes to editor squiggles and quick-fix suggestions |
| **docs/error-reference.md** | the human-readable companion: every code with an explanation and a fix |
| **CI** (.github/workflows/ci.yml) | regenerates and compares -- registry and ERROR_CODES must be in sync in every PR |

## Regenerating

```sh
bun scripts/generate-errors-json.ts
# -> errors.json: 93 codes written
```

Run it after ANY change to packages/compiler/tw/diagnostics/codes.ts. CI
fails if the committed errors.json does not match what the table produces
(the "errors.json in sync with ERROR_CODES" step).

## The complete registry (93 codes)

Extracted live at generation time. Severity `error` fails the build;
`warning` is advisory; categories group the codes by origin.

| Code | Severity | Category | Message |
|---|---|---|---|
| TW001 | error | syntax | Unexpected token |
| TW002 | error | syntax | Unclosed brace -- expected } |
| TW003 | warning | syntax | Unknown HTML tag |
| TW004 | warning | syntax | Unknown CSS property |
| TW005 | warning | syntax | Unknown event type |
| TW006 | info | syntax | Unknown attribute |
| TW007 | error | syntax | Page directive can only appear at the top of the file |
| TW008 | error | syntax | Layout directive must specify a layout name |
| TW009 | error | syntax | Import must specify a source module |
| TW010 | error | syntax | State variable must have a name and value |
| TW011 | error | syntax | Render mode must be one of: static, server, edge, interactive |
| TW012 | error | syntax | Revalidate must be a positive number (seconds) |
| TW013 | error | syntax | Redirect must specify a target URL |
| TW014 | error | semantic | Component not found |
| TW015 | warning | syntax | Duplicate attribute on element |
| TW016 | info | best-practice | Missing key attribute in for loop |
| TW017 | warning | syntax | Script block is empty |
| TW018 | warning | syntax | Style block is empty |
| TW019 | error | semantic | Circular component reference detected |
| TW020 | warning | syntax | Duplicate page directive |
| TW021 | error | semantic | Undefined variable referenced |
| TW022 | error | semantic | Undefined component referenced |
| TW023 | warning | semantic | Component prop type mismatch |
| TW024 | warning | semantic | Missing required prop |
| TW025 | info | best-practice | Unused import |
| TW026 | info | best-practice | Unused state variable |
| TW027 | error | semantic | State variable redeclared |
| TW028 | error | semantic | Invalid directive value |
| TW029 | error | semantic | Directive not allowed in this context |
| TW030 | warning | semantic | Missing required directive |
| TW031 | warning | semantic | Event handler not defined |
| TW032 | error | semantic | Binding expression is empty |
| TW033 | error | semantic | Invalid binding type |
| TW034 | warning | semantic | Slot name conflicts with component name |
| TW035 | info | best-practice | Template reference variable not used |
| TW036 | error | semantic | Duplicate component definition |
| TW037 | error | semantic | Component extends itself |
| TW038 | error | semantic | Invalid layout reference |
| TW039 | error | semantic | Middleware path is invalid |
| TW040 | warning | accessibility | Image missing alt attribute |
| TW041 | warning | accessibility | Form input missing label |
| TW042 | warning | accessibility | Button missing accessible text |
| TW043 | info | accessibility | Missing ARIA label on interactive element |
| TW044 | warning | accessibility | Invalid ARIA role |
| TW045 | warning | accessibility | Invalid ARIA attribute |
| TW046 | warning | accessibility | Heading hierarchy skip detected |
| TW047 | info | accessibility | Missing lang attribute on html element |
| TW048 | info | accessibility | Tab order may be incorrect |
| TW049 | info | accessibility | Color contrast may be insufficient |
| TW050 | info | performance | Large inline script -- consider extracting |
| TW051 | info | performance | Large inline style -- consider extracting |
| TW052 | info | performance | Deeply nested DOM tree |
| TW053 | info | performance | Too many DOM nodes |
| TW054 | info | performance | Unoptimized image -- consider lazy loading |
| TW055 | info | performance | Unused CSS rules detected |
| TW056 | info | performance | Duplicate styles detected |
| TW057 | info | performance | Consider code splitting for large components |
| TW058 | info | performance | Inline event handler may cause performance issues |
| TW059 | info | performance | Consider memoization for expensive computation |
| TW060 | warning | security | Potential XSS vulnerability -- unescaped output |
| TW061 | error | security | Dangerous HTML injection detected |
| TW062 | info | security | Inline event handler -- consider CSP |
| TW063 | warning | security | External script without integrity check |
| TW064 | info | security | Missing Content-Security-Policy |
| TW065 | warning | security | Mixed content detected (HTTP on HTTPS page) |
| TW066 | warning | security | Sensitive data in template |
| TW067 | info | security | Missing nonce for inline script |
| TW068 | error | security | eval() usage detected |
| TW069 | warning | security | Dangerous URL pattern detected |
| TW070 | info | best-practice | Use semantic HTML elements |
| TW071 | info | best-practice | Avoid inline styles -- use CSS classes |
| TW072 | info | best-practice | Consider using a button instead of a div with click |
| TW073 | info | best-practice | Add type attribute to script tags |
| TW074 | info | best-practice | Use async/defer for non-critical scripts |
| TW075 | info | best-practice | Add width/height to images |
| TW076 | info | best-practice | Use rel="noopener" for external links |
| TW077 | info | best-practice | Add loading="lazy" to below-fold images |
| TW078 | info | best-practice | Consider using <picture> for responsive images |
| TW079 | info | best-practice | Use <button type="button"> for non-submit buttons |
| TW080 | warning | deprecation | Deprecated HTML tag |
| TW081 | warning | deprecation | Deprecated CSS property |
| TW082 | warning | deprecation | Deprecated API usage |
| TW083 | warning | deprecation | Deprecated attribute |
| TW084 | warning | deprecation | Deprecated event name |
| TW085 | warning | deprecation | Deprecated directive syntax -- use new syntax |
| TW086 | warning | deprecation | Deprecated state declaration syntax |
| TW087 | warning | deprecation | Deprecated component lifecycle hook |
| TW088 | warning | deprecation | Deprecated import path |
| TW089 | warning | deprecation | Deprecated render mode -- use 'interactive' |
| TW090 | error | syntax | cache { } requires a revalidate window or a life profile |
| TW091 | error | semantic | fn cached handler is impure (request.cookies/headers/body or setSignal) |
| TW092 | error | semantic | Unknown cache profile |
| TW093 | warning | best-practice | Non-deterministic call in a cached handler (value freezes into the cache entry) |

## Code allocation map

- **TW001-TW019** -- lexer/parser syntax errors (unexpected tokens, unclosed
  braces, malformed directives)
- **TW020-TW049** -- structural and attribute rules (nesting, duplicate
  attributes, table membership)
- **TW050-TW069** -- semantic rules (state, events, interpolation types)
- **TW070-TW089** -- server/build rules (routing, middleware, handlers)
- **TW090-TW093** -- the v1.0.6 cache layer gates:
  - **TW090** `cache { }` requires a revalidate window or a life profile
    (also fires for `revalidate -5` -- no valid window)
  - **TW091** `fn cached` handler is impure (cookies/headers/body/setSignal)
  - **TW092** unknown cache profile (build-time resolution failure)
  - **TW093** non-deterministic call in a cached handler (warning: the
    value freezes into the cache entry)

## How to add a code

The end-to-end checklist lives in skills/add-diagnostic and
.claude/commands/new-diagnostic.md. The invariant to hold: **count in
errors.json == number of entries in codes.ts == number of entries in
docs/error-reference.md** -- CI checks the first equality, review checks
the second.

## What NOT to do

1. Never hand-edit errors.json (regenerated from codes.ts -- edits vanish).
2. Never reuse a code number after removing a diagnostic -- codes are
   permanent vocabulary; deprecate, do not recycle.
3. Never emit a diagnostic without a message that teaches: the message is
   the product (a user's first and often only teacher).
