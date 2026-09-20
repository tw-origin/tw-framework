# TW Framework — Guide: Self-Hosting on a VPS

This guide covers one thing completely: running a TW app on your own server — the full server with Bun, the zero-dependency Node static server, and nginx/Caddy in front.

---

## The Three Self-Hosted Shapes

| Shape | Serves | Files |
|-------|--------|-------|
| Full server | pages + `.twm` APIs + middleware | `tw serve` or `tw adapter bun` |
| Static, zero-dependency | `.tw/` output | `tw adapter node` → `server.mjs` |
| Static, plain web server | `.tw/` output | `tw adapter nginx` or `tw adapter caddy` |

---

## Full Server

```bash
tw build
tw serve                     # foreground
# or:
tw adapter bun
bun server.ts
```

Keep it alive with a process manager:

```bash
# systemd unit — /etc/systemd/system/tw-app.service
[Unit]
Description=TW app
After=network.target

[Service]
WorkingDirectory=/var/www/tw-app
ExecStart=bun server.ts
Environment=PORT=8000
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now tw-app
```

Set secrets in `Environment=` lines or an `EnvironmentFile` — never in the repo.

## Static with server.mjs

```bash
tw build
tw adapter node
PORT=8000 node server.mjs
```

One file, Node 18+, no `npm install`. Clean URLs, ETag/304, gzip, Range, immutable caching, security blocklist — see [Server Features](./server-features.md). Run it under systemd the same way.

## Static with nginx

```bash
tw adapter nginx
```

Adjust `server_name` and `root` in the generated `nginx.conf`, then:

```bash
cp nginx.conf /etc/nginx/sites-available/tw-app
ln -s /etc/nginx/sites-available/tw-app /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Static with Caddy (automatic HTTPS)

```bash
tw adapter caddy
```

Replace `example.com` with your domain and point DNS at the server:

```bash
caddy run     # certificates issued and renewed automatically
```

---

## HTTPS

- **Caddy** — automatic, no configuration beyond the domain
- **nginx** — certbot: `certbot --nginx -d example.com`
- **Behind Cloudflare** — proxy mode terminates TLS at the edge

## Keeping the Deploy Fresh

```bash
cd /var/www/tw-app
git pull
tw build
systemctl restart tw-app      # full server; static needs no restart
```

Or automate with a git post-receive hook / CI runner that runs the same three commands.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Site down after reboot | `systemctl enable` the unit |
| 502 from nginx | the upstream (server.mjs / bun) is not running — check the service |
| Old content after deploy | static: verify `.tw/` was rebuilt; browsers cache hashed assets only until their content changes |
| Permission denied reading .tw | the service user (www-data) must read the project dir |

## Scaling

`tw serve` runs one Node or Bun process per instance. Pages are stateless — they render from the compiled `.tw/` output on disk — so most deployments scale by running multiple instances behind a load balancer (nginx, a cloud load balancer, or the platform's router).

Two pieces of server state are held in the process, not shared:

| State | Behavior across instances | How to account for it |
|-------|--------------------------|------------------------|
| `rateLimit` counters | Each instance keeps its own window | Set `max` per instance: `instances x max` is the effective ceiling per IP; for a shared counter, front the app with a rate-limiting proxy |
| `middleware.twm` `rate_limit` rules | Same per-process fixed window | Same arithmetic as above |

Everything else — static assets, gzip, security headers, redirects, per-path headers, image variants — is derived from disk or the request, so every instance behaves identically.

Recommended setup for more than one instance:

1. Build once (`tw build`) and ship the same `.tw/` output to every instance.
2. Terminate TLS and gzip at the load balancer if it supports it; the server also gzips compressible responses itself.
3. Run `server.mjs` (or `tw serve`) under a supervisor — systemd, Docker restart policy, or the platform's process manager — the server drains connections gracefully on `SIGTERM` / `SIGINT`.
4. Point health checks at a cheap static route (for example `/`) — a 200 means routes are loaded and the server is accepting requests.

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Server Features](./server-features.md)
- [Environments](./guide-environments.md)
