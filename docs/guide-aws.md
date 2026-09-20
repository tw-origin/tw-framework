# TW Framework — Guide: Deploying to AWS

This guide covers one thing completely: running a TW app on AWS — static output on S3 + CloudFront, and the full server on container services.

---

## Two Paths

| What you built | Where it runs |
|----------------|---------------|
| Static output (`render static`, pre-rendered island pages) | S3 bucket behind CloudFront |
| Full server (`render ssr` pages, `.twm` APIs, middleware) | App Runner / ECS Fargate / Lightsail containers |

---

## Path A — Static: S3 + CloudFront

### 1. Create the bucket

An S3 bucket for the site. Keep "block public access" **on** and let CloudFront read the bucket through an origin access control — the bucket is never public.

### 2. Create the distribution

A CloudFront distribution with:

- Origin: the S3 bucket
- Default root object: `index.html`
- Custom error response: 403/404 → `/index.html`, 200 (optional, for SPA-style fallback)

### 3. Generate the deploy script

```bash
tw adapter aws
```

Writes `deploy-s3.sh` and `AWS-DEPLOY.md` into the project.

### 4. Deploy

```bash
tw build
BUCKET=my-bucket DISTRIBUTION_ID=E123ABC bash deploy-s3.sh
```

The script uploads `/assets/*` and `/js/*` with immutable cache headers, everything else with `no-cache`, then invalidates CloudFront so new HTML is live immediately.

Put it in CI:

```yaml
- run: npm install && npx tw build
- run: BUCKET=$BUCKET DISTRIBUTION_ID=$DIST bash deploy-s3.sh
```

with the credentials configured through the runner's IAM role.

---

## Path B — Full Server: Containers

The full server runs as a container that listens on `PORT`:

```bash
tw adapter docker
```

- **App Runner** — create a service from the repo (or an ECR image). App Runner injects `PORT`; the image honours it. The smallest operational burden on AWS.
- **ECS Fargate** — task definition with the image, container port = `PORT`, an ALB in front.
- **Lightsail containers** — same image, simpler console.

Push the image to ECR, point the service at it, set the health check to `/`.

---

## Domains and HTTPS

- CloudFront: attach an ACM certificate (must be in `us-east-1` for CloudFront) and alias the domain
- App Runner / ALB: ACM certificate in the service's region

## Environment Variables

`.twm` routes read `process.env` — configure secrets in the service settings (App Runner → Configuration → Environment variables; ECS → task definition). Never bake them into the image.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `AccessDenied` from CloudFront | origin access control not set up, or the OAC policy missing on the bucket |
| New HTML not visible | you skipped `DISTRIBUTION_ID` — run the invalidation, or pass it |
| Container restarts on App Runner | the app crashed on boot — check logs; usually a missing env var |
| Health check failing | the target must answer `/` with 200; verify `PORT` matches the container port |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Docker guide](./guide-self-hosted.md) · [Railway](./guide-railway.md) — container platforms without AWS
