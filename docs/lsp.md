# TW Framework — LSP

This document covers one thing completely: `tw lsp` — the language server for `.tw` files.

---

## Starting It

```bash
tw lsp
```

The language server speaks JSON-RPC over stdio — point any LSP-capable editor at the command. Editor plugins that support a custom language server binary can launch `tw lsp` directly.

## What It Does

| Capability | What you get |
|------------|--------------|
| initialize handshake | server announces its features |
| diagnostics | errors and warnings for the open file, same checks as the compiler |
| completions | tag names, attribute names, state fields, imports |
| hover | symbol information where the cursor rests |
| format | formatting for the open `.tw` file |

The diagnostics come from the same validators `tw build` runs — TW error codes ([Error Reference](./error-reference.md)) — so what the editor shows is what the build enforces.

## Why It Matters

The compiler is the source of truth; the language server surfaces it while you type. An invalid attribute or an unclosed block is underlined before you ever run a build.

## Running It Standalone

For a quick check without an editor:

```bash
printf '%s\n' 'h1 "hi"' | tw lsp
```

The server reads JSON-RPC messages on stdin and writes responses to stdout — usable from scripts and tests.

## Related

- [Commands Reference](./commands-reference.md)
- [Error Reference](./error-reference.md)
