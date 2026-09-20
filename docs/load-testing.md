# TW Framework — Load Testing

This document covers one thing completely: `scripts/loadtest.ts` — running a concurrency load test against a running TW server.

---

## Usage

```bash
bun scripts/loadtest.ts --url http://localhost:3000 --path / --total 1000 --concurrency 20
```

The server must already be running — start it in another terminal (`tw serve --port 3000`).

## Flags

| Flag | Meaning | Default |
|------|---------|---------|
| `--url` | Base URL of the server under test | (required) |
| `--path` | Path to request repeatedly | `/` |
| `--total` | Total number of requests to send | `100` |
| `--concurrency` | Simultaneous in-flight requests | `10` |

## Example Run

```bash
$ bun scripts/loadtest.ts --url http://localhost:3000 --total 1500 --concurrency 25

Requests:    1500 / 1500
Errors:      0
Avg:         3.2 ms
p95:         9.8 ms
p99:         14.1 ms
Max:         18.7 ms
Throughput:  2311 req/s
```

## Reading the Numbers

| Number | What it tells you |
|--------|-------------------|
| Errors | Anything non-2xx/3xx or a network failure — should be 0 |
| Avg | Overall responsiveness under load |
| p95 / p99 | Tail latency — the number real users complain about |
| Throughput | Requests per second the server sustained at that concurrency |

## Method

- Requests are fired round-robin from up to `--concurrency` workers; the next request starts as soon as the previous finishes.
- Each response status is checked; redirects are followed but non-2xx/3xx statuses count as errors.
- The run finishes when `--total` requests have completed.

## What to Look For

1. **Errors at high concurrency** — usually a resource ceiling (open files, ports) or a server crash; check the server log alongside.
2. **p99 spiking while avg stays flat** — GC pauses, lock contention, or one slow path (a cache miss storm).
3. **Throughput plateau** — increasing `--concurrency` past the plateau only adds latency, not throughput; that is your saturation point.

Compare a static page, a rendered page, and an API route (`--path /api/...`) separately — they exercise different parts of the pipeline (doc 169).
