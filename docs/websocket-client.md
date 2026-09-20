# TW Framework — WebSocket Client

This document covers one thing completely: `createConnection`, `getConnection`, `closeConnection`, and `closeAllConnections` — the managed WebSocket layer exported by `@tw/runtime`.

---

## createConnection

```twm
import { createConnection } from "@tw/runtime"

const socket = createConnection("orders", {
  url: "wss://example.com/ws",
  protocols: ["v1"],                   // optional subprotocols
  reconnect: true,                     // auto-reconnect on drop
  reconnectInterval: 1000,             // first retry delay (ms)
  maxReconnectInterval: 30000,         // backoff cap
  backoffMultiplier: 1.5,              // delay growth per attempt
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,            // ping cadence
  heartbeatMessage: { type: "ping" },   // custom ping payload
  heartbeatTimeout: 10000,             // declare dead after no pong
})
```

Connections are NAMED. `createConnection("orders", ...)` — a second call with the same name reuses the existing connection (reconnecting it if idle) instead of opening another socket.

## Using the Connection

```twm
socket.on("message", (data: unknown) => renderTick(data))
socket.on("open", () => setBadge("live"))
socket.on("close", (event) => setBadge("offline"))
socket.on("error", (err) => console.error(err))
socket.send("subscribe", { channel: "prices" })
```

`WSMessage` carries the parsed payload — text frames arrive as strings, JSON frames as parsed objects.

## Status

```twm
socket.statusSignal    // Signal<ConnectionStatus> — live status
socket.isConnected      // boolean snapshot
```

## Reconnect and Heartbeat

- **Backoff**: retry delay starts at `reconnectInterval` and multiplies by `backoffMultiplier` per attempt, capped at `maxReconnectInterval`. A clean close (code 1000) stops reconnection; abnormal closes keep trying up to `maxReconnectAttempts`.
- **Heartbeat**: pings go out every `heartbeatInterval`; if no response arrives within `heartbeatTimeout`, the connection is torn down and reconnected — half-open TCP connections never linger.

## Lookup and Teardown

```twm
import { getConnection, closeConnection, closeAllConnections } from "@tw/runtime"

const same = getConnection("orders")     // same instance as createConnection("orders")
closeConnection("orders")                // graceful single close
closeAllConnections()                    // page teardown — closes every socket
```

## Pattern: One Connection per Concern

```twm
// realtime/orders.ts
export const ordersSocket = createConnection("orders", { url: wsUrl(), heartbeatInterval: 20000 })

// realtime/chat.ts
export const chatSocket = createConnection("chat", { url: wsUrl(), heartbeatInterval: 20000 })

// anywhere
import { getConnection } from "@tw/runtime"
getConnection("chat")?.send("typing", {})
```

Naming by concern gives each domain its own reconnect policy while sharing one import surface — and `closeAllConnections()` cleanly shuts the page down.
