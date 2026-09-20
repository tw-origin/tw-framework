# TW Framework — WebSocket Server

This document covers one thing completely: the server-side connection manager from `@tw/server` — accepting connections, rooms, and broadcasting.

---

## The Manager

```twm
import { WebSocketManager } from "@tw/server"   // per-server instance
```

Each running site owns a manager that tracks every open socket, its metadata, and the room registry.

## Connections

```twm
manager.add(connection, { userId, session })   // register a socket on open
manager.get(id)                                 // lookup by connection id
manager.remove(id)                              // deregister on close (auto-leaves rooms)
manager.broadcast(payload)                       // send to EVERY connected socket
manager.send(id, payload)                        // send to one connection
manager.getConnections()                         // all live entries
```

## Rooms

Sockets join named rooms; broadcasts can target one room instead of everyone.

```twm
manager.createRoom("orders")                 // explicit creation (auto on join)
manager.joinRoom(connectionId, "orders")
manager.leaveRoom(connectionId, "orders")
manager.broadcastToRoom("orders", { tick: 42 })   // only that room
manager.getRoom("orders")                        // room + members
manager.getRooms()
```

| Rule | Detail |
|------|--------|
| Room creation | Automatic on first join; `createRoom` for pre-creation with metadata |
| Capacity | `maxRoomSize` per room — a full room refuses joins |
| Registry cap | `maxRooms` total — creating beyond it raises |
| Cleanup | A room disappears when its last member leaves |

## Typical Server Wiring

```twm
Bun.serve({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      const ok = server.upgrade(req, { data: { session: req.headers.get("cookie") } })
      return ok ? undefined : new Response("Upgrade failed", { status: 400 })
    }
    return app.fetch(req)
  },
  websocket: {
    open(ws) {
      manager.add(ws, {})
      manager.joinRoom(ws.data.id, "live")
    },
    message(ws, message) {
      const msg = JSON.parse(String(message))
      if (msg.type === "subscribe") manager.joinRoom(ws.data.id, msg.channel)
      if (msg.type === "publish") manager.broadcastToRoom(msg.channel, msg.payload)
    },
    close(ws) {
      manager.remove(ws.data.id)     // rooms update automatically
    },
  },
})
```

## Broadcast Semantics

- `broadcast(payload)` serializes once and sends to every socket regardless of room membership.
- `broadcastToRoom(name, payload)` iterates only that room's members — membership is a `Set`, so each socket receives exactly one copy even if it joined multiple ways.
- Payloads are JSON-encoded; binary frames should be sent per-connection.

## Pattern: Presence

```twm
manager.add(ws, { user: userId })
manager.joinRoom(id, "room-" + roomId)

// on every join/leave:
manager.broadcastToRoom("room-" + roomId, {
  type: "presence",
  count: manager.getRoom("room-" + roomId).members.size,
})
```

## Client Side

Use the managed client from doc 144 (`createConnection`) — its heartbeats and reconnect backoff pair with this manager's room model; a client re-joining after reconnect should re-send its `subscribe` messages since room membership is per-connection.
