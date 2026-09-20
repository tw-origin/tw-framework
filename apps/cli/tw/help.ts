/** TW CLI -- help text. */

export const helpText = `
  TW Framework v1.0.0

  Usage: tw <command> [options]

  Commands:

    create <name>          Create a new TW project
      --template <name>    Template: default, minimal, blog, dashboard

    dev                    Start development server with HMR
      --port <number>      Port (default: 3000)
      --host <address>     Host (default: localhost)
      --open               Open browser automatically

    build                  Build project for production
      (uses tw.config.ts)

    serve                  Start production server
      --port <number>      Port (default: 8000)
      --host <address>     Host (default: 0.0.0.0)

    check                  Run type check and diagnostics

    lsp                    Start the language server (stdio) for editors
                          completion, hover, format and diagnostics over
                          JSON-RPC; editor setting: tw.serverPath = "tw lsp"

    ship [target]          Deploy to platform
    adapter [name]         Generate deployment adapter files (node, bun, docker, vercel)
      targets: node, bun, docker, vercel, netlify, cloudflare,
                          aws, digitalocean, render, railway, fly,
                          github-pages, firebase, nginx, caddy
      (default: auto-detect)

    plugin <action>        Manage plugins
      list                 List installed plugins
      add <name>           Add a new plugin
      remove <name>        Remove a plugin
      create <name>        Create a plugin package

    help                   Show this help message

  Examples:

    tw create my-app
    tw create my-blog --template blog
    tw dev --port 8080
    tw build
    tw serve --port 3000
    tw ship vercel
    tw plugin add analytics

  Configuration:

    Create tw.config.ts in project root:

      export default {
        dev: { port: 3000 },
        build: { minify: true },
        server: { port: 8000 },
      }

  More info: https://github.com/tw-origin/tw-framework
`;
