# TW Framework — Webhooks

This document covers one thing completely: receiving webhooks — verifying their signature and acting on the payload.

---

## The Endpoint

A webhook is a `POST` route. Declare it like any other:

```twm
// home/api/stripe/route.twm
export async function post(request) {
  const event = request.body ?? {}
  return { status: 200, json: { received: true } }
}
```

Return `200` fast — senders retry anything else, and retries can pile up.

## Verifying the Signature

Never trust the body on its own. Senders sign the raw body with a shared secret; verify with HMAC:

```twm
import { hmacSha256 } from "@tw/security"

const secret = process.env.WEBHOOK_SECRET ?? ""

export async function post(request) {
  const signature = request.headers["x-signature"] ?? ""

  const expected = await hmacSha256(secret, JSON.stringify(request.body))

  if (signature !== expected) {
    return { status: 401, json: { ok: false, error: "bad signature" } }
  }

  // process the event
  return { status: 200, json: { received: true } }
}
```

Compare exactly; a mismatched signature means the body was altered or the sender is not the service you configured.

## Responding First, Working After

The sender only cares about the status code. Do the minimum needed to answer `200` and persist the event — process it from there:

```twm
// store first, process separately — webhook senders want fast 200s
await recordEvent(event)
return { status: 200, json: { received: true } }
```

## Rate and Size Notes

Webhook senders can burst. The per-path `rate_limit` rule ([Rate Limiting](./rate-limiting.md)) and the 10 MB body cap ([Body Limits](./body-limits.md)) both apply to webhook routes like any other.

## Related

- [API Routes](./api-routes.md)
- [Security](./security.md)
