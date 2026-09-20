# TW Framework — CSP Nonces

This document covers one thing completely: nonce-based Content Security Policy — allowing your scripts while blocking injected ones.

---

## What a Nonce Is

A nonce is a random value generated per response and attached to your `<script>` tags and the CSP header. A browser only executes scripts whose nonce matches — injected scripts without one never run.

```html
<script src="/pages/p-789.js" nonce="a3f9c2..."></script>
```

```
Content-Security-Policy: script-src 'nonce-a3f9c2...'
```

## Generating Nonces

The security package ships a nonce manager:

```twm
import { generateNonce } from "@tw/security"

const nonce = generateNonce()   // fresh random value
```

Generate a new nonce per response — never reuse one across requests, or the protection collapses to a static allow-list.

## Wiring It

1. generate the nonce for the request
2. emit it in the `Content-Security-Policy` response header
3. emit it on every `script` tag the page renders

When the CSP headers are enabled in configuration, the server applies the policy header; the page pipeline stamps script tags with the request's nonce.

## Nonce vs Hash

| Approach | Fits |
|----------|------|
| nonce | dynamic pages, per-response scripts |
| hash | static files — a fixed script with a fixed hash |

For static builds where the HTML is pre-rendered, hash-based CSP is the workable pair — the file content, and therefore the hash, is stable.

## Related

- [Security](./security.md)
- [CSRF](./csrf.md)
