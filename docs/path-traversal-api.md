# TW Framework — Path Traversal Prevention

This document covers one thing completely: `createPathPreventer` from `@tw/security` — validating file paths against traversal patterns, extension rules, and a base-directory boundary.

---

## Creating the Preventer

```twm
import { createPathPreventer } from "@tw/security"

const preventer = createPathPreventer({
  baseDir: "/var/www/app/public",       // paths must stay INSIDE this directory
  allowedExtensions: [".png", ".jpg", ".webp", ".svg", ".txt"],
  blockedExtensions: [".env", ".twm", ".ts"],
  strict: false,                          // strict raises severity on warnings
})
```

All options are optional — a preventer without `baseDir` checks only patterns and extensions.

## validate

```twm
const result = preventer.validate("../../etc/passwd")

// {
//   safe: false,
//   detected: true,
//   patterns: ["Parent directory sequence (../)", ...],
//   sanitizedPath: "../../etc/passwd",   // after normalization
//   normalizedPath: "../../etc/passwd",
//   risk: "critical",
// }
```

| Field | Meaning |
|--------|---------|
| `safe` | Boolean verdict — check this |
| `detected` | Any traversal pattern matched |
| `patterns` | Human-readable list of every rule that fired |
| `normalizedPath` | Separators unified, `.` segments resolved |
| `risk` | `none / low / medium / high / critical` |

## What It Detects

| Pattern | Caught |
|---------|-------|
| `../` sequences | Including encoded variants (`%2e%2e%2f`) and backslash forms |
| Absolute paths | When a relative path is expected |
| Null bytes | `..%00`-style truncation tricks |
| Base-directory escape | The joined path must resolve INSIDE `baseDir` — a plain string-prefix check would accept sibling directories like `public-secret` next to `public`; containment is boundary-aware |
| Extension violations | Against both the allowed and blocked lists |

## Containment Details

The base-directory check builds the joined path from the NORMALIZED base (a `baseDir` with a trailing slash, mixed separators, or `..` cannot make the comparison disagree with itself) and accepts only `fullPath === base` or `fullPath.startsWith(base + "/")`.

## Pattern: Safely Serving User-Chosen Files

```twm
fn get(request) {
  const path = request.query.get("file") ?? ""
  const result = preventer.validate(path)
  if (!result.safe) {
    return { status: 400, json: { ok: false, error: "invalid path" } }
  }
  const full = join(baseDir, result.normalizedPath)
  return serveFile(full)
}
```

## Layering

Use this preventer at the INPUT layer when your own code accepts a path. The static file server and the image handler run their own containment checks internally (docs/static-assets-public.md, docs/image-handler.md) — you do not need this module to harden those.
