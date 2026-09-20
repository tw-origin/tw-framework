# TW Framework — Guide: Deploying to Firebase Hosting

This guide covers one thing completely: publishing a static TW site on Firebase Hosting.

---

## What Firebase Hosting Serves

Static output — pages, assets and chunks — on Google's CDN, globally.

## Setup

```bash
tw adapter firebase
```

Writes `firebase.json`:

```json
{
  "hosting": {
    "public": ".tw",
    "cleanUrls": true,
    "headers": [ ... immutable caching for /assets/** and /js/** ... ]
  }
}
```

Deploy:

```bash
npm install -g firebase-tools
firebase login
tw build
firebase deploy
```

## Clean URLs

`"cleanUrls": true` serves `/about` for `about/index.html` — no trailing `.html` anywhere.

## CI Deployment

Store a Firebase service-account token as a CI secret and:

```yaml
- run: npm install && npx tw build
- run: npx firebase-tools deploy --token "$FIREBASE_TOKEN"
```

## Custom Domains

Firebase console → Hosting → Add custom domain. TLS is provisioned automatically.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "no public directory" error | `firebase.json` must sit in the repo root with `public: ".tw"` |
| Deploy uploads nothing | run `tw build` first — `.tw/` must exist |
| Wrong content after deploy | Firebase serves what was uploaded; run `firebase hosting:delete` for the stale path or redeploy |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Cloudflare](./guide-cloudflare.md) · [Netlify](./guide-netlify.md)
