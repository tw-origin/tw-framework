# TW Framework — production Docker image (full server: pages + .twm APIs).
#
#   docker build -t tw-app .
#   docker run -p 8000:8000 tw-app
#
# Static site (no .twm API routes)? Use Dockerfile.static instead —
# its runtime is a tiny zero-dependency Node alpine image.

# ---- Stage 1: install + build ----
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json bun.lock* ./
RUN bun install

# The TW CLI (published as tw-framework on npm)
RUN bun add -d tw-framework

# Build the app
COPY . .
RUN bunx tw build

# ---- Stage 2: runtime ----
FROM oven/bun:1
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000
ENV HOST=0.0.0.0

COPY --from=build /app ./

EXPOSE 8000
CMD ["bunx", "tw", "serve"]
