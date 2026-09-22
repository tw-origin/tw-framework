---
description: Triage a bug report or failing behavior
allowed-tools: Bash(bun *), Read(**)
---
# /triage

Classify first; reproduce before proposing anything.

## 1. Check the quirks list FIRST

AGENTS.md section 11 -- many reports are documented language behavior:
`name "value"` attribute syntax, keyword-colliding attributes needing
HTML form, void elements rejecting closing tags, TSS shorthand names,
annotation-xml parsing as text, /secret serving from home/secret/page.tw.
If the report matches a quirk: close as works-as-designed, cite the entry.

## 2. Classify

| Label | Meaning | Next step |
|---|---|---|
| bug | reproducible misbehavior | needs a failing test FIRST |
| compiler / server / runtime / cli | the surface | route to that package |
| docs | documentation gap | one-thing-completely rewrite |
| performance | hot-path regression | the relevant bench, before/after |
| works-as-designed | a quirk | cite AGENTS.md, close kindly |

## 3. Reproduce minimally

The smallest input that shows the behavior -- a page.tw or route.twm
snippet, or a compileSync one-liner:

```sh
bun -e 'import {compileSync} from "./packages/compiler/tw/index.ts";
const out = compileSync(process.argv[1], {filePath:"/scratch/repro.tw"});
console.log(out.diagnostics, out.html.length)' 'page { title "x" }
div { "y" }'
```

## 4. Turn it into a failing test BEFORE the fix

A bug that cannot be expressed as a failing test is not understood well
enough to fix. contributing/issue-triage.md is the full process.

## 5. Report back

What it is (classification), the minimal reproduction, whether it
reproduces at the deterministic layer (compileSync / resolveCache) or
only under the test preload (quirk 8 -- say so explicitly), and the
proposed next action.
