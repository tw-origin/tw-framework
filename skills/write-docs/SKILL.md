---
name: write-docs
description: Write a canonical TW Framework documentation page -- one thing, completely
version: 1.0.6
---

# Skill: write-docs

A docs page in this repo is canonical: the page IS the truth for its
topic, and a feature without a page does not exist. 185 pages already
follow this shape -- the reader can rely on it, so do not break it.

## The house shape

1. **Opener** (mandatory, verbatim style):
   "This document covers one thing completely: <thing>."
2. **Semantics first** -- what it IS, before any syntax. The reader
   should understand the model before the notation.
3. **Syntax with examples** -- every example one you ran. If you did not
   run it, run it or cut it.
4. **Edge cases** -- the behaviors that surprise, stated plainly (and
   cross-checked against the quirks list, AGENTS.md section 11).
5. **Error codes involved** -- the TW0xx codes this topic can produce,
   with one-line explanations (full form in error-reference.md).
6. **Related pages** -- flat links to sibling docs/ files.

## The rules

- **Canonical English.** Chat may be Hinglish; docs never are.
- **One thing.** If the outline needs a second "This document covers",
  it is two pages.
- **No forward references to unwritten pages.** Link only what exists.
- **Numbers come from runs.** "98k renders/sec" is a bench result with a
  command attached, not a vibe (bench/README.md documents how to
  reproduce it).
- **New user-facing error? Same change updates errors.json + the
  reference.** CI checks the registry; review checks the page.

## Workflow

1. Read the two or three existing pages closest to the topic -- match
   their depth and voice (docs/cache-tags.md is the current gold
   standard, written with the v1.0.6 design doc).
2. Write the page.
3. Run every command and compile every snippet in it.
4. Update cross-references in related pages that mention the topic.
5. `bun run verify` (docs do not affect it, but the habit is the habit).

## Anti-patterns (all seen, all rejected)

- A page that enumerates files instead of explaining behavior.
- Examples with `...` eliding the part the reader actually needs.
- "Simply" and "just" -- if it were simple, the reader would not need
  the page.
- Version-specific claims without the version ("currently" is fine;
  timeless wrong is not).
