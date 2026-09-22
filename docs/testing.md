# TW Framework — Testing

This document covers one thing completely: how the framework's own test suite is organized and run — the unit matrix, the isolated e2e suite, and the conventions for adding tests. Modeled on Next.js's contributing/core/testing.md structure, adapted to TW's Bun-based toolchain.

---

## Test Types in TW

| Type | Location | Runs against | Speed |
|------|----------|-------------|-------|
| unit | `tests/unit-*.test.ts` | pure compiler/server code, no server, no browser | milliseconds |
| e2e | `tests/e2e-isolated-app.test.ts` | `tw build` + `tw serve` on a random port, real HTTP | seconds |

The rest of `tests/*.test.ts` are feature suites (lexer, parser, cache, security, signals, …) written in the same style.

## Running

```sh
bun test                       # everything (2692 tests, ~11s)
bun test tests/unit-css-matrix.test.ts   # one file
bun test -t "cache"            # by name pattern
bun run lint                   # per-package tsc typecheck
```

## The Unit Matrix (it.each style)

The framework's builtin tables (HTML_ELEMENTS, CSS_PROPERTIES, EVENT_TYPES, ARIA_ROLES, …) are the contract between the compiler and the web platform. Each entry gets a **real behavioral assertion** — a compile or a resolution runs and the output is checked:

```ts
describe("CSS properties matrix (it.each over CSS_PROPERTIES)", () => {
  for (const prop of CSS_PROPERTIES) {
    test(`${prop}: compiles in TSS`, () => {
      const css = compileTSS(`.x { ${prop}: inherit }`);
      expect(css).toContain(`${prop}: inherit`);
    });
  }
});
```

Suites:

| Suite | Table | Assertions |
|-------|-------|-----------|
| `unit-html-elements` | HTML_ELEMENTS (199) | every element compiles (DSL or HTML form) |
| `unit-html-attributes` | GLOBAL/HTML_ATTRIBUTES + BOOLEAN_ATTRS | every attribute reaches the output; booleans collapse |
| `unit-events` | EVENT_TYPES (116) + EVENT_HANDLER_ATTRS (110) | `on:<event>` binds a `data-tw-event-*` handler |
| `unit-aria` | ARIA_ROLES (80) + ARIA_ATTRIBUTES (52) | concrete roles accepted; **abstract roles rejected with TW044** |
| `unit-css-matrix` | CSS_PROPERTIES (328), TSS_SHORTHANDS, CSS_ALIASES, CSS_FUNCTIONS (102), MEDIA_FEATURES (56), PSEUDO_CLASSES (53), LENGTH_UNITS (43) | every declaration form compiles |
| `unit-web-tables` | MIME_TYPES, HTTP_STATUS_CODES, CSP_DIRECTIVES, JS_RESERVED | platform tables + security presets |
| `unit-router-directives` | route shapes | `[slug]`, `[...all]`, `[[...optional]]`, route groups, parallel slots |

Known language quirks the matrix documents (not bugs, documented behavior):

- DSL-reserved tag names (`var`, `use`, `set`) compile via the HTML form
- keyword-colliding attribute names (`for`, `dir`, `as`, …) compile via the HTML form
- any DOM event name is accepted (`docs/syntax-events.md`): unknown events still bind

## The Isolated E2E Suite

`tests/e2e-isolated-app.test.ts` follows the Next.js `nextTestSetup` contract:

1. A complete fixture app is written into a fresh temp directory (pages, API routes, actions, middleware, tw.config.ts).
2. `tw build` runs against it — a non-zero exit fails the suite.
3. `tw serve` starts on a **random port**; readiness is polled.
4. Every assertion is a real HTTP round trip (raw `node:http` — the test preload registers happy-dom whose fetch enforces browser CORS).
5. The server is killed and the fixture deleted in `afterAll`.

Covered end to end: SSR pages with cache windows (MISS→HIT), the legacy ISR form, unicode (Hindi) routes, cached `fn cached` handlers with stable payloads, POST echo handlers, server actions with `revalidateTag` (read-your-writes), middleware rules (allowed and blocked user agents), `tw.config.ts` redirects, security headers, and 404s.

## Conventions

- All tests are TypeScript, flat in `tests/`, one `describe` per concern.
- Parameterize over tables; never copy-paste near-identical cases.
- An assertion must check real output (compiled HTML/CSS, resolved values, HTTP status/headers) — not internal state.
- A test that discovers a bug: fix the framework, then lock the correct behavior in the suite (see: abstract ARIA roles → TW044).
