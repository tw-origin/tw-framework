/**
 * Ambient declarations for the server-block runtime helpers.
 *
 * They exist ONLY inside a `server { }` block (they are injected as bindings
 * when the block runs). Declaring them here lets an editor resolve the names
 * in a block's TypeScript and see that `redirect`/`notFound` return `never`.
 *
 * The runner is what enforces availability -- a static block gets throwing
 * stand-ins (TW107/TW108), and the names do not exist outside a block.
 */

/** The request's session, or null. Never throws. */
declare function getSession(): any;
/** The user (session.user ?? session.data ?? session), or throws redirect(loginPath). */
declare function requireUser(): any;
/** Redirect to a same-origin internal path (validated). Returns `never`. */
declare function redirect(target: string): never;
/** Render the 404 route. Returns `never`. */
declare function notFound(): never;
