# TW Framework — Source Maps

This document covers one thing completely: sourcemaps — mapping compiled output back to your `.tw` source.

---

## Enabling

Sourcemaps are a build option in `tw.config.ts`:

```ts
export default {
  build: {
    sourcemap: "linked",   // none | linked | inline | external
  },
};
```

| Mode | Output |
|------|--------|
| `none` | no maps (default for release builds) |
| `linked` | `.map` file beside the chunk, referenced by it |
| `inline` | map embedded in the chunk as a data URI |
| `external` | `.map` file written, not referenced — load it yourself |

## What Gets Mapped

The compiler's source-map builder covers its emitted code paths — compiled page chunks and client modules. A stack trace in the browser resolves to the `.tw` file and line you wrote.

## Why Use Them

- an error in production HTML traces to the component, not the compiled chunk
- browser DevTools shows your `.tw` sources in the debugger
- bug reports from the field name real source locations

## What Not To Do

- do not ship `inline` maps to production if you do not want source text embedded in the response
- `none` keeps the output smallest — fine when nothing downstream reads stack traces

## Related

- [Configuration](./configuration.md)
- [Build Output](./build-output.md)
