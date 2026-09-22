# Security Policy

## Supported versions

The latest 1.0.x release receives security fixes.

## Reporting a vulnerability

Please do NOT open a public issue for security problems.

1. Email the maintainer (see SECURITY.md in the repo root), or
2. Open a private security advisory via GitHub's "Report a vulnerability".

You will get an acknowledgement within 72 hours. Please include:
reproduction steps, affected surface (compiler/CLI/server/runtime), and any
proof-of-concept.

## Scope

- The framework packages (compiler, server, runtime, security)
- The CLI commands (dev/build/serve/ship)
- The example apps served with production settings

Out of scope: social engineering, DoS on our CI, issues in dependencies
(reported upstream).
