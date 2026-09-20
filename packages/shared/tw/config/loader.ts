/** Config loader - finds, parses, merges config files. */

import { type TwConfig } from "./schema";
import { createDefaultConfig, findConfig } from "./defaults";
import { readFileSync } from "../fs";
import { extname } from "node:path";
import { getLogger } from "../logger";
import { validateConfig } from "./validate";

function safeJsonParse(json, fallback) {
  try { return JSON.parse(json); }
  catch { return fallback; }
}



export async function loadConfig(rootDirOrConfig: string | Partial<TwConfig> = process.cwd()): Promise<TwConfig> {
  const logger = getLogger().child("config");

  // Object form: an already-resolved partial config, merged directly with
  // defaults -- no filesystem lookup (used by callers/tests that construct
  // config in-memory rather than reading a tw.config.* file).
  if (typeof rootDirOrConfig === "object" && rootDirOrConfig !== null) {
    const merged = mergeConfig(createDefaultConfig(process.cwd()), rootDirOrConfig);
    const resolved = resolveEnvVars(merged);
    validateConfig(resolved);
    return resolved;
  }

  const rootDir = rootDirOrConfig as string;
  const configPath = findConfig(rootDir);

  if (!configPath) {
    logger.debug("No tw.config found, using defaults");
    return resolveEnvVars(createDefaultConfig(rootDir));
  }

  logger.debug(`Loading config from: ${configPath}`);

  const ext = extname(configPath);
  let userConfig: Partial<TwConfig>;

  try {
    switch (ext) {
      case ".ts":
      case ".js":
      case ".mjs":
      case ".cjs":
        userConfig = await loadJSConfig(configPath);
        break;
      case ".json":
        userConfig = JSON.parse(readFileSync(configPath));
        break;
      case ".yaml":
      case ".yml":
        userConfig = await loadYAMLConfig(configPath);
        break;
      case ".toml":
        userConfig = await loadTOMLConfig(configPath);
        break;
      default:
        userConfig = {};
    }
  } catch (err) {
    logger.error(`Failed to load config: ${configPath}`, err as Error);
    return resolveEnvVars(createDefaultConfig(rootDir));
  }

  const merged = mergeConfig(createDefaultConfig(rootDir), userConfig);
  const resolved = resolveEnvVars(merged);
  validateConfig(resolved);

  logger.debug("Config loaded successfully", { file: configPath });
  return resolved;
}

export function loadConfigSync(rootDir: string = process.cwd()): TwConfig {
  const logger = getLogger().child("config");
  const configPath = findConfig(rootDir);

  if (!configPath) {
    return resolveEnvVars(createDefaultConfig(rootDir));
  }

  const ext = extname(configPath);
  let userConfig: Partial<TwConfig>;

  try {
    switch (ext) {
      case ".json":
        userConfig = JSON.parse(readFileSync(configPath));
        break;
      case ".yaml":
      case ".yml":
        // Simple YAML fallback -- no external dep
        userConfig = parseSimpleYAML(readFileSync(configPath));
        break;
      case ".toml":
        userConfig = parseSimpleTOML(readFileSync(configPath));
        break;
      default:
        // For .ts/.js -- try require
        try {
          if (configPath.includes("..") || configPath.includes("\x00")) {
      userConfig = {};
    } else {
      userConfig = (globalThis as any).require?.(configPath) ?? {};
    };
          if ((userConfig as any).default) userConfig = (userConfig as any).default;
        } catch {
          userConfig = {};
        }
    }
  } catch (err) {
    logger.error(`Failed to load config: ${configPath}`, err as Error);
    return resolveEnvVars(createDefaultConfig(rootDir));
  }

  const merged = mergeConfig(createDefaultConfig(rootDir), userConfig);
  const resolved = resolveEnvVars(merged);
  validateConfig(resolved);
  return resolved;
}

// --- Config Loaders ----------------------------------------------------------

async function loadJSConfig(path: string): Promise<Partial<TwConfig>> {
  // Bun can natively import .ts files
  try {
    const mod = await import(path);
    return mod.default ?? mod;
  } catch {
    // Fallback: require
    try {
      const mod = (globalThis as any).require?.(path);
      return mod?.default ?? mod ?? {};
    } catch {
      return {};
    }
  }
}

async function loadYAMLConfig(path: string): Promise<Partial<TwConfig>> {
  const content = readFileSync(path);
  return parseSimpleYAML(content);
}

async function loadTOMLConfig(path: string): Promise<Partial<TwConfig>> {
  const content = readFileSync(path);
  return parseSimpleTOML(content);
}

// --- Simple YAML Parser -----------------------------------------------------

function parseSimpleYAML(content: string): any {
  const result: any = {};
  const lines = content.split("\n");
  const stack: { indent: number; obj: any }[] = [{ indent: -1, obj: result }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(":");

    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === "") {
      const newObj: any = {};
      parent[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      parent[key] = parseYAMLValue(value);
    }
  }

  return result;
}

function parseYAMLValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    try { return JSON.parse(value); } catch {
      return value.slice(1, -1).split(",").map(s => s.trim());
    }
  }
  return value;
}

// --- Simple TOML Parser -----------------------------------------------------

function parseSimpleTOML(content: string): any {
  const result: any = {};
  let currentSection = result;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const sectionPath = trimmed.slice(1, -1).split(".");
      currentSection = result;
      for (const part of sectionPath) {
        if (!currentSection[part]) currentSection[part] = {};
        currentSection = currentSection[part];
      }
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    currentSection[key] = parseTOMLValue(value);
  }

  return result;
}

function parseTOMLValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    try { return JSON.parse(value); } catch {
      return value.slice(1, -1).split(",").map(s => s.trim());
    }
  }
  return value;
}

// --- Config Merging ----------------------------------------------------------

export function mergeConfig(base: TwConfig, override: Partial<TwConfig>): TwConfig {
  return deepMerge(base, override) as TwConfig;
}

function deepMerge(target: any, source: any): any {
  // Prototype pollution protection
  if (typeof target !== "object" || target === null) return target;
  if (typeof source !== "object" || source === null) return source;
  if (source === null || source === undefined) return target;
  if (typeof source !== "object" || typeof target !== "object") return source;
  if (Array.isArray(source)) return [...source];
  if (Array.isArray(target)) return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// --- Environment Variable Resolution -----------------------------------------

const ENV_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}|\$(ENV_[A-Z_][A-Z0-9_]*)/g;

export function resolveEnvVars(config: TwConfig): TwConfig {
  let resolved: any;
  try {
    resolved = JSON.parse(JSON.stringify(config));
  } catch {
    resolved = { ...config };
  }

  function resolveString(str: string): string {
    return str.replace(ENV_PATTERN, (_, bracket, prefix) => {
      const varName = bracket || prefix;
      return process.env[varName] ?? "";
    });
  }

  function walk(obj: any): void {
    if (typeof obj === "string") {
      // Can't replace in-place during walk -- handled via parent
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "string") {
        obj[key] = resolveString(obj[key]);
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        walk(obj[key]);
      }
    }
  }

  walk(resolved);
  return resolved;
}

// --- Config Validation -------------------------------------------------------

export interface ValidationError {
  path: string;
  message: string;
  value: any;
}
