// The bun adapter ships `tw-framework/server` -- the published subpath a real
// app resolves. Inside the monorepo that package is not linked into
// node_modules, so declare the specifier for the type checker.
declare module "tw-framework/server" {
  export * from "@tw/server";
}
