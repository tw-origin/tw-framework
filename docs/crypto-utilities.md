# TW Framework — Crypto Utilities

This document covers one thing completely: the cryptography helpers exported by `@tw/shared` — hashing, HMAC, random generation, encryption, TOTP, and masking primitives shared by every TW package.

---

## Hashing

```twm
import { sha256, sha512, md5, hashString, hashObject, hmac, verifyHmac } from "@tw/shared"

sha256("payload")                     // hex digest string
sha512(buf)                            // works on strings and buffers
hashString("algo-independent form")    // stable, algorithm-tagged
hashObject({ a: 1 })                   // key-order-independent object hash
const mac = hmac(secret, data)         // HMAC
verifyHmac(secret, data, mac)          // boolean
```

Also exported: `sha1`, `sha384`, `crc32`, `fnv1aHash`, `djb2Hash`, `murmurhash3`, `sdbmHash`, `hashFile`, `hashStream`, `computeETag` (see doc 166).

## Constant-Time Comparison

```twm
import { constantTimeCompare, timingSafeEqual, compareHashes } from "@tw/shared"

constantTimeCompare(submittedToken, expectedToken)   // boolean, no length leak
```

Every secret comparison in the framework routes through these — password checks, CSRF signatures, API-key matching. Use them for your own secrets too.

## Random Generation

```twm
import { randomBytes, randomHex, randomString, randomInt, randomSalt, randomUUID } from "@tw/shared"

randomBytes(16)        // Uint8Array from crypto
randomHex(32)          // hex string
randomString(20)       // alphanumeric
randomInt(0, 100)        // inclusive range
randomSalt()            // password-grade salt
randomUUID()            // RFC 4122 v4
```

## Key Derivation and Symmetric Encryption

```twm
import { deriveKey, encryptString, decryptString, encryptAES, decryptAES } from "@tw/shared"

const key = await deriveKey(password, salt)         // PBKDF2-based
const blob = await encryptString(secret, key)
const back = await decryptString(blob, key)          // null on wrong key/tampering
```

RSA: `generateRSAKeyPair`, `encryptRSA`, `decryptRSA`, `signData`, `verifySignature`.

## API Keys and OTP

```twm
import { generateApiKey, maskApiKey, generateTOTP, verifyTOTP, generateOTP } from "@tw/shared"

const key = generateApiKey(32)
maskApiKey(key)                 // "tw_live_****abcd"
generateTOTP(secret)             // current 6-digit code
verifyTOTP(secret, code)         // window-aware boolean
```

## Masking for Display

```twm
import { maskEmail, maskPhone, maskCreditCard, maskSensitiveData } from "@tw/shared"

maskEmail("kanishk@example.com")     // "k******k@example.com"
maskPhone("9876543210")               // "******3210"
maskCreditCard("4111111111111111")   // "************1111"
```

## Integrity Structures

```twm
import { buildMerkleTree, verifyMerkleProof, compareETags, contentHash } from "@tw/shared"
```

Merkle trees for chunked-content verification; `contentHash` for stable multi-field fingerprints.

## Rules

- Never hand-roll comparisons — `constantTimeCompare` exists for every equality check on secrets.
- Keys come from `randomBytes`/`generateSecret` and live in env vars, never in source.
- The classic ciphers (`caesarCipher`, `rot13`, `xorStrings`, `atbash`, `vigenere*`) are for puzzles and tests — not for protecting data.
