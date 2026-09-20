/** Config validation and utilities. */

import { type TwConfig } from "./schema";
import { getLogger } from "../logger";
import { ValidationError } from "./loader";

export function validateConfig(config: TwConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const logger = getLogger().child("config:validate");

  if (config.dev.port < 0 || config.dev.port > 65535) {
    errors.push({ path: "dev.port", message: "Port must be between 0 and 65535", value: config.dev.port });
  }

  if (config.server.port < 0 || config.server.port > 65535) {
    errors.push({ path: "server.port", message: "Port must be between 0 and 65535", value: config.server.port });
  }

  if (config.dev.https && (!config.dev.httpsCert || !config.dev.httpsKey)) {
    errors.push({ path: "dev.https", message: "HTTPS enabled but cert/key not provided", value: config.dev.https });
  }

  if (config.server.ssl && (!config.server.ssl.cert || !config.server.ssl.key)) {
    errors.push({ path: "server.ssl", message: "SSL enabled but cert/key not provided", value: config.server.ssl });
  }

  if (config.build.target === "edge" && config.build.format !== "esm") {
    errors.push({ path: "build.format", message: "Edge target requires ESM format", value: config.build.format });
  }

  if (config.cache.type === "redis" && !process.env.REDIS_URL) {
    errors.push({ path: "cache.type", message: "Redis cache requires REDIS_URL env var", value: config.cache.type });
  }

  if (config.compiler.optimization === "aggressive" && !config.compiler.minifyHTML) {
    logger.warn("Aggressive optimization enabled but HTML minification is off -- consider enabling minifyHTML");
  }

  if (config.security.csp["script-src"]?.includes("'unsafe-inline'")) {
    logger.warn("CSP allows 'unsafe-inline' for scripts -- consider using nonces instead");
  }

  for (const err of errors) {
    logger.error(`Config validation error: ${err.path} -- ${err.message}`);
  }

  return errors;
}

export function isValidConfig(config: TwConfig): boolean {
  return validateConfig(config).length === 0;
}

// --- Config Serialization -----------------------------------------------------

export function serializeConfig(config: TwConfig): string {
  return JSON.stringify(config, null, 2);
}

export function toPublicConfig(config: TwConfig): Record<string, any> {
  // Remove sensitive fields
  let sanitized: any;
  try {
    sanitized = JSON.parse(JSON.stringify(config));
  } catch {
    sanitized = { ...config };
  }
  if (sanitized.server.ssl) {
    sanitized.server.ssl = { cert: "[redacted]", key: "[redacted]" };
  }
  return sanitized;
}
