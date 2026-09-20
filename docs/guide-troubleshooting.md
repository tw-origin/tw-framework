# TW Framework — Guide: Troubleshooting

This guide covers one thing completely: diagnosing a broken TW app — by symptom, from dev to production.

---

## Dev Server

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Page blank, no error in terminal | open the browser devtools console — the error overlays there | fix the reported file/line |
| "command not found: tw" | CLI not on PATH | run via `bunx tw ...` or `npx tw ...` |
| Port already in use | another process holds it | `tw dev --port 4000` |
| Styles missing | the page's chain has no style import | `import "@./style/global.tss"` in the root layout |
| Edits do nothing | editing inside `.tw/` | edit the sources — `.tw/` is generated output |
| TW1007 in console | a page imports server-only code | move the import to `lib/` or a `.twm` route |

## Build

| Symptom | Fix |
|---------|-----|
| Build fails with TW1007 | server-only import in a page/layout — see [Client Modules](./client-modules.md) |
| Build fails with TW200 | `render static` page with state or events — switch to `ssr`/`island` or remove the interactivity |
| "tw: command not found" on a platform | `tw-framework` missing from `dependencies` |
| Build succeeds, pages 404 in output | check the build log — routes come from `home/` directories ([Project Structure](./project-tree.md)) |
| Stale output after big changes | `rm -rf .tw && tw build` |

## Production Server

| Symptom | Fix |
|---------|-----|
| Wrong port | precedence: `--port` > `PORT` > `tw.config.ts` > default — check for a stray `PORT` |
| EADDRINUSE | another process on the port — free it or change ports |
| `.twm` route 404s | was `tw build` run? does the route file sit at `home/api/.../route.twm`? |
| Admin area public | middleware rule missing/overbroad — see [Middleware](./middleware.md) |
| 500 with no detail | the server hides internals; the detail is in the server console |
| Assets 404 | `/assets/*` and `/js/*` come from `.tw/` — confirm the build output is what the server serves |

## Platform Deploys

| Symptom | Fix |
|---------|-----|
| Works locally, 404 on platform | publish/output dir must be `.tw` (dot prefix!) — use a generated adapter, or allow dot-directories |
| Old version after deploy | confirm the deploy finished; hashed asset names change with content |
| Login broken only in production | `JWT_SECRET` not set on the platform — set it in the service env |
| Docker crash-loop | `docker logs <id>` — usually a missing environment variable |

## Reading the Error Codes

| Range | System | List |
|-------|--------|------|
| TW001–020 | syntax | [Error Reference](./error-reference.md) |
| TW100–120 | routing | same |
| TW200–210 | render modes | same |
| TW300–310 | extensions | same |
| TW1007 | server boundary | [Client Modules](./client-modules.md) |

## The Universal Diagnostic Sequence

```
1. tw check            — type errors surface first
2. tw build            — compiler errors, TW1007, TW200
3. tw serve + curl /   — does the built app answer at all?
4. curl the failing path — narrow to a route
5. read the server console — 500 details live there, never in the response
```

## Asking for Help Effectively

Bring: the error text, the file it names, the command you ran, and whether dev/build/serve differed. The error codes exist so that this combination identifies the problem immediately.

## Related

- [Error Reference](./error-reference.md) · [Environments](./guide-environments.md)
- [Server Features](./server-features.md) · [Tips](./tips-syntax.md)
