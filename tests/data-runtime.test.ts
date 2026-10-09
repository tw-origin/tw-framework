import { describe, test, expect } from "bun:test";
import { createGraphQL, parseGraphQL, createTrpcRouter } from "../packages/server/tw/data-runtime.ts";

// strategies.data.layer: graphql | trpc | routes.
// Real executors, not just a package check.

describe("graphql: parse", () => {
  test("reads operation type, name and variables", () => {
    const op = parseGraphQL("query GetUser($id: ID) { user(id: $id) { name } }");
    expect(op.type).toBe("query");
    expect(op.name).toBe("GetUser");
    expect(op.variables.id).toBe("ID");
    expect(op.selection[0].name).toBe("user");
  });
  test("mutation is recognised", () => {
    expect(parseGraphQL("mutation { add { id } }").type).toBe("mutation");
  });
  test("anonymous shorthand is a query", () => {
    expect(parseGraphQL("{ ping }").type).toBe("query");
  });
});

describe("graphql: execute", () => {
  const gql = createGraphQL({
    Query: {
      ping: () => "pong",
      user: (args: any) => ({ id: args.id, name: "Ada", email: "ada@x.io" }),
      users: () => [{ id: 1, name: "A" }, { id: 2, name: "B" }],
    },
    Mutation: { add: (args: any) => ({ id: 3, title: args.title }) },
  });

  test("resolves a scalar field", async () => {
    expect((await gql.execute("{ ping }")).data).toEqual({ ping: "pong" });
  });
  test("substitutes variables into arguments", async () => {
    const r = await gql.execute("query($id: ID) { user(id: $id) { id name } }", { variables: { id: "42" } });
    expect(r.data).toEqual({ user: { id: "42", name: "Ada" } });
  });
  test("selects only the requested fields", async () => {
    const r = await gql.execute('{ user(id: "1") { name } }');
    expect(r.data).toEqual({ user: { name: "Ada" } });
  });
  test("aliases rename the result key", async () => {
    const r = await gql.execute('{ me: user(id: "1") { name } }');
    expect(r.data).toEqual({ me: { name: "Ada" } });
  });
  test("resolves a list of objects", async () => {
    const r = await gql.execute("{ users { id name } }");
    expect(r.data).toEqual({ users: [{ id: 1, name: "A" }, { id: 2, name: "B" }] });
  });
  test("mutations run through the Mutation resolvers", async () => {
    const r = await gql.execute('mutation { add(title: "hi") { id title } }');
    expect(r.data).toEqual({ add: { id: 3, title: "hi" } });
  });
  test("a failing resolver becomes a GraphQL error, not a throw", async () => {
    const bad = createGraphQL({ Query: { boom: () => { throw new Error("nope"); } } });
    const r = await bad.execute("{ boom }");
    expect(r.errors?.[0].message).toBe("nope");
    expect(r.data).toEqual({ boom: null });
  });
  test("a malformed query does not hang the parser", async () => {
    const r = await gql.execute("{ user(id: ");
    expect(r.data).toBeNull();
    expect(r.errors?.length).toBe(1);
  });
  test("a parse error is reported in errors", async () => {
    const r = await gql.execute("{ ping");
    expect(r.data).toBeNull();
    expect(r.errors?.length).toBe(1);
  });
});

describe("trpc: router", () => {
  const router = createTrpcRouter({
    greet: { query: ({ input }: any) => `hi ${input?.name ?? "world"}` },
    createUser: { mutation: ({ input }: any) => ({ id: 7, ...input }) },
    boom: { query: () => { throw Object.assign(new Error("bad input"), { code: "BAD_REQUEST" }); } },
  });

  test("toResponse turns a result into a Response", async () => {
    const res = router.toResponse({ status: 200, json: { ok: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("a GET query parses ?input= and wraps in result.data", async () => {
    const res = await router.handle({ url: "http://x/api/trpc/greet?input=%7B%22name%22%3A%22Ada%22%7D", method: "GET" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ result: { data: "hi Ada" } });
  });
  test("a POST mutation reads { input } from the body", async () => {
    const res = await router.handle({
      url: "http://x/api/trpc/createUser", method: "POST",
      json: async () => ({ input: { name: "Bea" } }),
    });
    expect(res.json).toEqual({ result: { data: { id: 7, name: "Bea" } } });
  });
  test("an unknown procedure is a 404", async () => {
    const res = await router.handle({ url: "http://x/api/trpc/nope", method: "GET" });
    expect(res.status).toBe(404);
    expect((res.json as any).error.code).toBe("NOT_FOUND");
  });
  test("a query called with POST is method-not-supported", async () => {
    const res = await router.handle({ url: "http://x/api/trpc/greet", method: "POST", json: async () => ({}) });
    expect(res.status).toBe(405);
    expect((res.json as any).error.code).toBe("METHOD_NOT_SUPPORTED");
  });
  test("a throwing procedure becomes an error response with its code", async () => {
    const res = await router.handle({ url: "http://x/api/trpc/boom", method: "GET" });
    expect(res.status).toBe(400);
    const body: any = res.json;
    expect(body.error.message).toBe("bad input");
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});
