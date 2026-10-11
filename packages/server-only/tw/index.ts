/**
 * `@tw/server-only` -- the server-only marker module.
 *
 * Importing it is a no-op on the server. Its only effect is that any module
 * whose source contains `import "@tw/server-only"` is treated as server-only,
 * so importing that module from the client graph is a TW1007 build error
 * (see apps/cli/tw/commands/server-boundary.ts).
 */
export {};
