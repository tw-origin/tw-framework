# Webhook Log -- A POST Receiver and a Log Viewer

The smallest honest event pipeline: POSTs append to a module log, GETs
read it back. No cache anywhere -- the log IS the fresh data.

## What it teaches

- POST receivers that store (module state, then a real store)
- GET viewers over the same state
- Why this handler must NOT be fn cached (request.body is impure -- TW091)

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -sX POST -d "{'event':'ping'}" http://127.0.0.1:8123/api/hook
curl -s http://127.0.0.1:8123/api/hook; kill %1)
```
