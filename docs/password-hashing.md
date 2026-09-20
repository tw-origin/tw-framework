# TW Framework — Password Hashing

This document covers one thing completely: `createPasswordManager` — PBKDF2 hashing, verification, strength checking, and password generation from `@tw/security`. For the registration flow that uses it, see doc 55.

---

## createPasswordManager

```twm
import { createPasswordManager } from "@tw/security"

const pw = createPasswordManager({
  minEntropy: 50,          // bits required to pass
  minLength: 8,
  maxLength: 128,
  iterations: 100000,     // PBKDF2 rounds
  saltLength: 32,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSymbols: false,
})
```

## hash

```twm
const result = await pw.hash("correct horse battery staple")

// result: { hash, salt, iterations, algorithm }  -- PasswordHashResult
```

Store the WHOLE result — `hash`, `salt`, `iterations`, and `algorithm` — as one record. The hash is an OBJECT, not a bare string; verification needs every field. The salt is unique per password, generated at hash time.

## verify

```twm
const ok = await pw.verify("correct horse battery staple", stored)
// true / false
```

`stored` is the `PasswordHashResult` you saved at registration. Comparison is constant-time on the derived key — the answer does not depend on how many bytes matched.

## checkStrength

```twm
const strength = pw.checkStrength("abc")

// {
//   score: 1,                       // 0-4
//   label: "very-weak",             // very-weak | weak | fair | strong | very-strong
//   entropy: 15,                    // bits
//   suggestions: ["Add more characters", ...],
//   passed: false,                   // meets config thresholds
// }
```

Use `passed` for the config-gated accept/reject and `suggestions` for the UI hints.

## generate

```twm
const password = pw.generate(20)     // crypto-random, letters+digits+symbols
```

## Full Registration Flow

```twm
async function register(email: string, password: string) {
  const strength = pw.checkStrength(password)
  if (!strength.passed) {
    return { ok: false, suggestions: strength.suggestions }
  }
  const stored = await pw.hash(password)
  await db.users.insert({ email, password: stored })   // whole object
  return { ok: true }
}

async function login(email: string, password: string) {
  const stored = await db.users.findByEmail(email)
  if (!stored) return { ok: false }
  return { ok: await pw.verify(password, stored) }
}
```

## Parameters That Matter

| Parameter | Trade-off |
|-----------|-----------|
| `iterations` | Higher = slower brute force AND slower logins; 100k is the shipped default |
| `minEntropy` | Entropy-based strength beats character-class rules; 50 bits ≈ a strong phrase |
| `saltLength` | 32 is comfortably beyond collision needs; leave it |

Rehash on login when you raise `iterations` — `verify` still passes old records, and you can re-hash with the new cost transparently.
