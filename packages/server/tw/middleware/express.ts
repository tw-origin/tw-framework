import type { Middleware } from "./index";
import type { RouteContext } from "../router";

/**
 * Adapt an express-style `(req, res, next)` middleware to the TW pipeline's
 * `(ctx, next)` shape, so middleware written for express -- `sessionMiddleware`,
 * `csrfProtection`, `cookieParser` -- can be registered with `server.use()`.
 *
 * The adapter passes `ctx.request` through as `req` and gives the middleware a
 * lightweight `res` shim:
 *   - `res.headers.set("Set-Cookie", value)` is collected and merged into the
 *     final response by the server (so a session cookie survives to the client).
 *   - `res.status` / `res.body` short-circuit the request: the middleware's
 *     response is returned instead of continuing to the route or page.
 *
 * The middleware's own `next()` is a no-op -- in the pipeline, control advances
 * when the wrapped function returns, so calling `next()` and falling through are
 * the same thing.
 */
export function asMiddleware(
  expressMw: (req: Request, res: any, next: () => void) => void | Promise<void>,
): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>) => {
    const setCookies: string[] = [];
    let status: number | undefined;
    let body: string | undefined;
    let contentType: string | undefined;

    const headers: any = {
      set(key: string, value: string) {
        const k = String(key).toLowerCase();
        if (k === "set-cookie") setCookies.push(value);
        else if (k === "content-type") contentType = value;
      },
      get() {
        return undefined;
      },
    };

    const res: any = {
      headers,
      set status(v: number) {
        status = v;
      },
      get status() {
        return status ?? 200;
      },
      set body(v: string) {
        body = v;
      },
      get body() {
        return body;
      },
    };

    await expressMw(ctx.request, res, () => {});

    if (setCookies.length) {
      const state = ctx.state as { setCookies?: string[] };
      (state.setCookies ??= []).push(...setCookies);
    }

    // A middleware that wrote a body short-circuits the request (e.g. a 403).
    if (body !== undefined) {
      ctx.state.expressResponse = new Response(body, {
        status: status ?? 200,
        headers: contentType ? { "content-type": contentType } : {},
      });
      return;
    }

    return next();
  };
}
