# Calculator -- Expressions as the Templating Language

A four-function calculator where every handler is a single expression on
state -- the whole point of on:event expressions.

## What it teaches

- Chained state updates in one handler expression
- The display derives from state, never from DOM reads
- A grid UI in pure TSS

```sh
tw build && tw serve --port 8123 & sleep 2
# open it, do some arithmetic
```
