---
name: add-example
description: Create a new runnable example app in examples/ that builds clean and teaches one thing
version: 1.0.6
---

# Skill: add-example

Examples are the framework documentation that executes. Each one teaches
ONE thing completely, builds with `tw build`, and is verified by CI on
every push. This skill produces that standard, not a folder of sketches.

## 1. Decide the ONE thing

Before any file exists, finish this sentence: "After reading this example,
a developer can ____." If the sentence needs "and", it is two examples.
The current matrix (examples/README.md) shows the granularity: caching a
page, guarding a route, streaming a signal -- one verb each.

## 2. Scaffold the shape

Copy the shape of a minimal existing example (examples/todo-app):

```
examples/<name>/
├── package.json     scripts: dev/build/start/check/ship; dep tw-framework
├── README.md        the tutorial (step 6)
├── home/
│   ├── page.tw      the teaching page
│   ├── api/...      route.twm handlers, if the point is server-side
│   └── style/       global.tss + page.tss
└── middleware.twm   only if the example is ABOUT middleware
```

## 3. Write verified syntax ONLY

Every line must be a construct you have seen compile in this repo (the
quirks that bite, from AGENTS.md section 11):

- Attributes: `name "value"` with a SPACE -- `input type "text" { }`.
- Keyword-colliding attributes (dir, for, async, style): use HTML form,
  `<input type="text">`.
- Void elements: `img src "..." alt "..." { }` -- NEVER `</img>`.
- Events: `button on:click "count++" { "Add" }`.
- Interpolation: `h1 "Count: {count}"`.
- TSS shorthands are `bg-c` / `pt` style (the full table is in AGENTS.md
  section 23) -- NOT the hyphenated CSS aliases.

## 4. BUILD IT (the step that separates an example from a sketch)

```sh
cd examples/<name>
bun ../../apps/cli/tw/bin.ts build
```

A broken example never ships. If it does not build, fix the example, not
the framework (and if the framework IS wrong, that is a bug report with
the best reproduction anyone could ask for -- file it).

## 5. Serve and curl it

One shell invocation, always (background servers die between calls):

```sh
cd examples/<name>
bun ../../apps/cli/tw/bin.ts serve --port 8123 &
sleep 2
curl -sI http://127.0.0.1:8123/ | head -12
curl -s  http://127.0.0.1:8123/ | grep -c "<"
kill %1
```

## 6. Write the README as a tutorial

Follow the house pattern (see examples/dashboard/README.md): what it
teaches, quick start, every file with its full listing, how it works under
the hood, ten hands-on exercises, an FAQ of the real questions. Canonical
English. Every command in it must be one you ran.

## 7. Wire it into the matrix

Add the row to examples/README.md. The master gate (`bun run verify`)
builds every directory under examples/ -- your example is now load-bearing
for everyone.

## Common mistakes

1. Teaching two things (cache AND islands) -- split it.
2. Copying markup from the docs without building it.
3. A README that describes files instead of teaching behavior.
4. Forgetting step 7 and breaking the gate for the next contributor.
