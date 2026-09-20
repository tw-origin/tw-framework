# TW Framework — Guide: Forms

This guide covers one thing completely: building forms in TW — inputs, validation, submission and the server endpoint that receives them.

---

## A Basic Form

```tw
page { title "Contact" render ssr }

state {
  email = ""
  message = ""
  sent = false
}

div.form {
  form on:submit.prevent "sent = true" {
    input :value "email" { type "email" placeholder "you@example.com" required }
    textarea :value "message" { placeholder "Your message" required }
    button "Send" { type "submit" }
  }
  if sent { p "Thanks — we will reply to {email}." }
}
```

Two things make this work:

- `on:submit.prevent` — runs the handler without reloading the page
- `:value` bindings — every input writes back to state as the user types

## Validation — Client Side

HTML attributes first — `required`, `type "email"`, `min`, `max`:

```tw
input :value "email" { type "email" required }
input :value "age" { type "number" min "18" max "120" }
```

State-driven messages for everything else:

```tw
state { email = "" error = "" }

form on:submit.prevent "error = email.includes('@') ? '' : 'Enter a valid email'" {
  input :value "email" { type "text" placeholder "Email" }
  if error { p.error "{error}" }
  button "Check" { type "submit" }
}
```

## Validation — Server Side

The endpoint is where validation actually matters — client checks are convenience, server checks are the guarantee:

```twm
// home/api/contact/route.twm
fn post(request) {
  const body = request.body || {}
  const email = (body.email || "").trim()
  const message = (body.message || "").trim()

  if (!email.includes("@") || !email.includes(".")) {
    return { status: 400, json: { error: "Invalid email" } }
  }
  if (message.length < 10) {
    return { status: 400, json: { error: "Message too short" } }
  }

  // store / email / log — server-side work here
  return { status: 200, json: { ok: true } }
}
```

## Submitting to the API

```tw
state {
  email = ""
  message = ""
  sending = false
  result = ""
}

form on:submit.prevent "sending = true; fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, message }) }).then(r => r.json()).then(d => { sending = false; result = d.ok ? 'sent' : (d.error || 'failed') })" {
  input :value "email" { type "email" placeholder "Email" required }
  textarea :value "message" { placeholder "Message" required }
  button "Send" { type "submit" disabled }
}
if sending { p "Sending..." }
if result == "sent" { p "Message delivered." }
```

Checkboxes and selects write through events:

```tw
state { agreed = false plan = "starter" }

input type "checkbox" on:change "agreed = event.target.checked" { }
select on:change "plan = event.target.value" {
  option "Starter" { value "starter" }
  option "Pro" { value "pro" }
}
```

## Sanitizing What Comes Back

Anything stored and later rendered must be sanitized server-side:

```twm
import { XSSSanitizer } from "@tw/security"
```

See [Security](./security.md) for `XSSSanitizer`, `InputValidator` and the full checklist.

## Guard the Endpoint

Rate-limit the form endpoint in `middleware.twm`:

```twm
rule "contact-rate" {
  match "/api/contact"
  rate_limit { requests 5 window 300 identity "ip" }
  response { status 429 json { error "Too many submissions" } }
}
```

## Testing

```ts
import { testRoute } from "@tw/server/tw/testing";

test("POST /api/contact validates the email", async () => {
  const bad = await testRoute(process.cwd(), "POST", "/api/contact", { body: { email: "nope" } });
  expect(bad.status).toBe(400);
});
```

## Related

- [Events](./syntax-events.md) — `.prevent` and friends
- [Bindings](./syntax-bindings.md) — `:value`
- [API Routes](./api-routes.md) · [Middleware](./middleware.md) · [Security](./security.md)
