# Known issues

Defects that are understood, reproduced and deliberately not fixed yet. Each
entry says what happens, what it affects, and how it is contained.

---

## Scoped selectors are rewritten with a regex that mishandles several selector shapes

**Status:** open. Tracked separately from the CSS validation work.
**Affects:** `compiler.scopedStyles` — `<style scoped>` blocks only.

`scopeSelector()` in `packages/compiler/tw/codegen/css-extract.ts` appends the
scope attribute to the first token matching `[.#]?[\w-]+` in each
comma-separated part of a selector. That is correct for simple selectors and
wrong for several others:

| selector | current output | what is wrong |
|---|---|---|
| `.card` | `.card[data-tw-scope="s1"]` | correct |
| `#id` | `#id[data-tw-scope="s1"]` | correct |
| `div` | `div[data-tw-scope="s1"]` | correct |
| `> .child` | `> .child[data-tw-scope="s1"]` | correct |
| `.a .b` | `.a[data-tw-scope="s1"] .b` | only the first compound is scoped |
| `h2 + p` | `h2[data-tw-scope="s1"] + p` | only the first compound is scoped |
| `:is(.a, .b)` | `:is[data-tw-scope="s1"](.a,.b[data-tw-scope="s1"])` | **invalid CSS** — the attribute is appended to `:is`, and the comma inside the argument is treated as a list separator |
| `:not(.x)` | `:not[data-tw-scope="s1"](.x)` | **invalid CSS** |
| `:has(> img)` | `:has[data-tw-scope="s1"](> img)` | **invalid CSS** |
| `&:hover` | `&:hover[data-tw-scope="s1"]` | valid syntax, wrong meaning — the attribute lands after the pseudo-class |
| `&::before` | `&::before[data-tw-scope="s1"]` | valid syntax, wrong meaning |
| `*` | `*` | **silently unscoped** — the rule applies to the whole document |

`css-tree` rejects the `:is()`, `:not()` and `:has()` output as invalid CSS.

**Why it is not fixed yet:** fixing it changes the selector text that every
scoped page ships. That is a behaviour change and needs its own review, not a
ride-along with CSS validation.

**How it is contained:** `tests/scoped-selector.test.ts` locks the current
output for all twelve shapes, with each known bug marked `BUG:` in the test
name. When the function is fixed, those expectations change in one visible
diff.

**Who is affected:** **any user project** that writes `:is()`, `:not()`,
`:has()`, `&:hover`, `&::before` or `*` inside a `<style scoped>` block. The
broken output ships to their pages, so a rule either stops matching or becomes
invalid CSS the browser drops. This is not a repo-only concern.

**Docs examples:** none of the examples in `docs/` use a scoped block with any
of these selectors. `docs/scoped-styles.md` and `docs/configuration.md` both
show a plain `.box` rule, which the current rewrite handles correctly, so no
documented example is wrong today. That also means the docs give no warning —
worth adding once the function is fixed.

**In this repository:** no file uses a scoped `<style>` block, so the bug is
latent here rather than shipping. See the separate entry below for what
`<style scoped>` currently does.

---

## `<style scoped>` blocks emit no CSS at all

**Status:** open, separate from the selector rewriting above. Found while
proving that the `scopeSelector()` extraction was behaviour-neutral.

A page with

```tw
style scoped {
  .card { color: red; }
}
```

compiles with **no style block in the AST and no CSS in the output** — the block
is dropped, `data-tw-scope` never appears in the HTML, and the rule never
reaches the page. A plain `style { ... }` block works and produces
`.card{color:red}`.

Confirmed identical on `HEAD` before the `scopeSelector()` extraction, so it is
pre-existing, not a result of that change.

**Not investigated further:** the parser sets `scoped` from
`/\bscoped\b/i.test(openToken.value)` (`parser/statements/index.ts:1392`), so
the flag is being read somewhere the extractor never sees, or the block is
dropped before extraction. That needs its own investigation.

**Consequence for the selector bug above:** it cannot currently be triggered
through a `<style scoped>` block, because that block produces nothing. It is
still reachable through whatever path does set `rule.scope`, which is why the
characterisation tests matter.
