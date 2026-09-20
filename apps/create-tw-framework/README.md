# Create TW App

The easiest way to get started with [TW Framework](https://github.com/tw-origin/tw-framework) is by using `create-tw-framework`. This CLI tool enables you to quickly start building a new TW application, with everything set up for you — project scaffold, git repository and installed dependencies.

To get started, use the following command:

```
npx create-tw-framework@latest my-app
# or
npm create tw-app@latest my-app
# or
yarn create tw-app my-app
# or
pnpm create tw-app my-app
# or
bunx create-tw-framework my-app
```

You can also pass command line arguments to set up a new project non-interactively. See `create-tw-framework --help`:

```
Usage: create-tw-framework [project-directory] [options]

Options:
  -V, --version          output the version number
  --template <name>      scaffold with a specific template
  --skip-install         skip installing packages
  --disable-git          skip initializing a git repository
  -h, --help             display help for command
```

## Why use Create TW App?

`create-tw-framework` lets you create a new TW app within seconds. It is officially maintained by the creators of TW Framework, and includes a number of benefits:

- **Zero Configuration**: No configuration needed — the scaffold is complete, correct and buildable the moment it lands.
- **Sensible Defaults**: `tw dev`, `tw build` and `tw serve` scripts are wired into the generated `package.json` from the start.
- **Git Ready**: A fresh git repository is initialized in your project automatically (skip with `--disable-git`).
- **Installs For You**: Dependencies are installed as part of creation (skip with `--skip-install`).
- **Same Tool, One Command**: `create-tw-framework` runs the same `tw create` command shipped inside TW Framework, so the scaffold is always in sync with the version you install.

## Manual Installation

You can also create a project manually:

```
npm install tw-framework
npx tw create my-app
```

Then run `npm run dev` inside the new project to start the development server.

## Feedback

Issues and feature requests belong in the [TW Framework repository](https://github.com/tw-origin/tw-framework/issues).
