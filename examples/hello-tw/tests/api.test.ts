import { test, expect } from "bun:test";
import { testRoute } from "@tw/server/tw/testing";

test("GET /api returns ok", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api");
  expect(res.status).toBe(200);
  expect(res.json.ok).toBe(true);
});

test("POST /api echoes the body", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api", {
    body: JSON.stringify({ hello: "tw" }),
  });
  expect(res.status).toBe(201);
  expect(res.json.received.hello).toBe("tw");
});
