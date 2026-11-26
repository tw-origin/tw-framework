/**
 * `@tw/client-safe` -- the client-safe marker.
 *
 * Importing it is a no-op. Its only effect is that a module whose source
 * contains `import "@tw/client-safe"` is treated as safe for both server and
 * client, wherever it lives:
 *
 *   - `lib/` is server-only by default; this marker opts a module out.
 *   - A module outside `lib/` needs no marker at all -- this is only needed to
 *     make an exception explicit.
 *
 * The build still walks the module's own imports, so a client-safe module that
 * pulls in a server-only dependency is a TW1007 build error: the marker says
 * "this file is safe", not "skip the check for everything it imports".
 *
 * Only put it on a module you are sure carries no secret -- an API key, a
 * token, a database URL. The marker is a promise; the build cannot verify it.
 */
export {};
