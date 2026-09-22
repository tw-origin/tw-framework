# .agents -- Machine Index for Agent Tooling

This directory is the machine-readable index of the repo agent tooling.
The CANONICAL content lives elsewhere; this file points to it.

## Index

| Tool | Location | Contents |
|---|---|---|
| Skills (canonical) | `/skills/*/SKILL.md` | add-example, release, add-diagnostic, write-docs, bug-hunt |
| Skills index | `.agents/skills.json` | machine list of the five skills |
| Slash commands | `.claude/commands/*.md` | test, bench, release, triage, new-diagnostic |
| Command plugin | `.claude-plugin/plugin.json` + `marketplace.json` | the tw-dev command pack |
| Editor rules | `.cursor/rules/tw.mdc` | TW conventions for AI editors |
| Agent eval tasks | `/evals/agents/*.md` | rubric-scored agent tasks |
| Operating manual | `/AGENTS.md` | THE document -- commands, tables, quirks, rules |

## Why an index and not copies

Single source of truth: the skills and commands are edited once in their
canonical homes; this index only routes. A tool scanning .agents can
discover the five skills from skills.json without walking the tree, and
everything else from the table above.
