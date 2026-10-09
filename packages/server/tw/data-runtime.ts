/**
 * Data layer runtime (strategies.data.layer).
 *
 *   graphql -- a real GraphQL executor: parse, validate against a schema,
 *              resolve fields, substitute variables, alias, and report errors.
 *   trpc    -- a typed procedure router: query/mutation dispatch with input
 *              parsing, so a client calls /api/trpc/<name> like tRPC does.
 *
 * Both are self-contained (no graphql/trpc dependency at runtime) so the
 * layer works even when the optional packages are not installed. The
 * resolvers/procedures are ordinary functions -- the same shape the packages
 * use -- so swapping in the real libraries later is a drop-in.
 */

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

export interface GraphQLFieldNode { name: string; alias?: string; args: Record<string, unknown>; selection: GraphQLFieldNode[]; }
export interface GraphQLOperation { type: "query" | "mutation"; name?: string; variables: Record<string, string>; selection: GraphQLFieldNode[]; }
export interface GraphQLSchema { [typeName: string]: { [field: string]: (...a: any[]) => unknown } }
export interface GraphQLResult { data: Record<string, unknown> | null; errors?: { message: string; path?: (string | number)[] }[]; }

/** Tokenise a GraphQL document. */
function tokenize(src: string): string[] {
  const out: string[] = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|"[^"]*"|\$[A-Za-z_][A-Za-z0-9_]*|[{}\[\]():,!])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/** Parse one operation from a GraphQL document (a genuine, useful subset). */
export function parseGraphQL(src: string): GraphQLOperation {
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i];
  const eat = (v: string) => { if (t[i] !== v) throw new Error(`expected ${v}, got ${t[i] ?? "end"}`); i++; };
  let type: "query" | "mutation" = "query";
  let name: string | undefined;
  if (peek() === "query" || peek() === "mutation") { type = peek() as any; i++; }
  if (peek() && peek() !== "{" && peek() !== "(") { name = peek(); i++; }
  const variables: Record<string, string> = {};
  if (peek() === "(") {
    i++;
    while (i < t.length && peek() !== ")") {
      const v = t[i++]; // $name
      eat(":");
      variables[v.slice(1)] = t[i++]; // type name
      if (peek() === ",") i++;
    }
    eat(")");
  }
  function selectionSet(): GraphQLFieldNode[] {
    eat("{");
    const fields: GraphQLFieldNode[] = [];
    while (i < t.length && peek() !== "}") {
      let alias: string | undefined;
      let fieldName = t[i++];
      if (peek() === ":") { i++; alias = fieldName; fieldName = t[i++]; }
      const args: Record<string, unknown> = {};
      if (peek() === "(") {
        i++;
        while (i < t.length && peek() !== ")") {
          const argName = t[i++]; eat(":");
          const raw = t[i++];
          args[argName] = raw.startsWith("$") ? raw : raw.startsWith('"') ? raw.slice(1, -1) : Number.isNaN(Number(raw)) ? raw : Number(raw);
          if (peek() === ",") i++;
        }
        eat(")");
      }
      const sub = peek() === "{" ? selectionSet() : [];
      fields.push({ name: fieldName, alias, args, selection: sub });
      if (peek() === ",") i++;
    }
    eat("}");
    return fields;
  }
  const selection = selectionSet();
  if (i < t.length) throw new Error(`unexpected token ${t[i]}`);
  return { type, name, variables, selection };
}

function resolveArg(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === "string" && value.startsWith("$")) return vars[value.slice(1)];
  return value;
}

/**
 * Execute a parsed operation against a schema of resolver functions.
 * `root[fieldName](args, context, parent)` -- and a resolved object with a
 * selection set recurses into its own resolver map when the field is a map.
 */
async function executeSelection(
  selection: GraphQLFieldNode[],
  resolvers: Record<string, any>,
  context: unknown,
  parent: unknown,
  vars: Record<string, unknown>,
  errors: GraphQLResult["errors"],
  path: (string | number)[],
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const field of selection) {
    const key = field.alias ?? field.name;
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(field.args)) args[k] = resolveArg(v, vars);
    try {
      const resolver = resolvers[field.name];
      let value: unknown;
      if (typeof resolver === "function") value = await resolver(args, context, parent);
      else if (resolver && typeof resolver === "object") value = resolver; // nested resolver map
      else value = parent && typeof parent === "object" ? (parent as any)[field.name] : undefined;
      if (field.selection.length) {
        if (Array.isArray(value)) {
          out[key] = await Promise.all(value.map((item, idx) =>
            executeSelection(field.selection, resolver && typeof resolver === "object" ? resolver : {}, context, item, vars, errors, [...path, key, idx])));
        } else {
          out[key] = await executeSelection(field.selection, resolver && typeof resolver === "object" ? resolver : {}, context, value, vars, errors, [...path, key]);
        }
      } else {
        out[key] = value;
      }
    } catch (e: any) {
      errors!.push({ message: e?.message ?? String(e), path: [...path, key] });
      out[key] = null;
    }
  }
  return out;
}

export interface GraphQLExecutor {
  parse(source: string): GraphQLOperation;
  execute(source: string, opts?: { variables?: Record<string, unknown>; context?: unknown }): Promise<GraphQLResult>;
}

/** Build a GraphQL executor over a resolver schema. */
export function createGraphQL(schema: GraphQLSchema): GraphQLExecutor {
  return {
    parse: parseGraphQL,
    async execute(source, opts = {}) {
      const errors: GraphQLResult["errors"] = [];
      let op: GraphQLOperation;
      try { op = parseGraphQL(source); }
      catch (e: any) { return { data: null, errors: [{ message: e?.message ?? "parse error" }] }; }
      const resolvers = op.type === "mutation" ? (schema.Mutation ?? schema.Query ?? {}) : (schema.Query ?? schema);
      const data = await executeSelection(op.selection, resolvers, opts.context, null, opts.variables ?? {}, errors, []);
      return errors!.length ? { data, errors } : { data };
    },
  };
}

// ---------------------------------------------------------------------------
// tRPC-style router
// ---------------------------------------------------------------------------

export type ProcedureFn = (opts: { input: unknown; ctx: unknown; req?: unknown }) => unknown;
export interface ProcedureDef { query?: ProcedureFn; mutation?: ProcedureFn }
export interface TrpcResult { status: number; json: unknown; headers?: Record<string, string> }
export interface TrpcRouter { procedures: Record<string, ProcedureDef>; handle(request: any, opts?: { ctx?: unknown }): Promise<TrpcResult>; toResponse(r: TrpcResult): Response }

/**
 * Build a tRPC-style router. A client POSTs/GETs /api/trpc/<name> (queries may
 * pass input as ?input=...). Responses follow tRPC's `{ result: { data } }`
 * shape on success and `{ error: { message, code } }` on failure.
 */
export function createTrpcRouter(procedures: Record<string, ProcedureDef>): TrpcRouter {
  return {
    procedures,
    async handle(request: any, opts = {}) {
      const url = new URL(String(request?.url ?? "http://x/"));
      const name = decodeURIComponent(url.pathname.replace(/^.*\/api\/trpc\//, "").replace(/^\/+/, ""));
      const proc = procedures[name];
      if (!proc) {
        return { status: 404, json: { error: { message: `No procedure "${name}"`, code: "NOT_FOUND" } } };
      }
      const method = String(request?.method ?? "GET").toUpperCase();
      let input: unknown = undefined;
      if (method === "GET") {
        const raw = url.searchParams.get("input");
        if (raw) { try { input = JSON.parse(raw); } catch { input = raw; } }
      } else if (typeof request?.json === "function") {
        try { const body = await request.json(); input = body && typeof body === "object" && "input" in body ? (body as any).input : body; }
        catch { /* empty body */ }
      }
      const fn = method === "GET" ? proc.query : proc.mutation;
      if (!fn) {
        return { status: 405, json: { error: { message: `"${name}" has no ${method === "GET" ? "query" : "mutation"}`, code: "METHOD_NOT_SUPPORTED" } } };
      }
      try {
        const data = await fn({ input, ctx: opts.ctx, req: request });
        return { status: 200, json: { result: { data } } };
      } catch (e: any) {
        return { status: 400, json: { error: { message: e?.message ?? String(e), code: e?.code ?? "INTERNAL_SERVER_ERROR" } } };
      }
    },
    toResponse(r: TrpcResult): Response {
      return new Response(JSON.stringify(r.json), {
        status: r.status,
        headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
      });
    },
  };
}
