/** Route registry -- file-based and programmatic routing with params. */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Route {
  pattern: string;
  regex: RegExp;
  params: string[];
  handler: RouteHandler;
  method: string;
  middleware: string[];
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response | void> | Response | void;

export interface RouteContext {
  request: Request;
  url: URL;
  method: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: any;
  state: Record<string, any>;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

export class RouteRegistry {
  private routes: Route[] = [];
  private notFoundHandler: RouteHandler | null = null;
  private errorHandler: ((err: Error, ctx: RouteContext) => Response) | null = null;

  add(method: string, pattern: string, handler: RouteHandler, middleware: string[] = []): void {
    const { regex, params } = this.patternToRegex(pattern);
    this.routes.push({ pattern, regex, params, handler, method: method.toUpperCase(), middleware });
  }

  get(pattern: string, handler: RouteHandler, middleware?: string[]): void {
    this.add("GET", pattern, handler, middleware);
  }

  post(pattern: string, handler: RouteHandler, middleware?: string[]): void {
    this.add("POST", pattern, handler, middleware);
  }

  put(pattern: string, handler: RouteHandler, middleware?: string[]): void {
    this.add("PUT", pattern, handler, middleware);
  }

  patch(pattern: string, handler: RouteHandler, middleware?: string[]): void {
    this.add("PATCH", pattern, handler, middleware);
  }

  delete(pattern: string, handler: RouteHandler, middleware?: string[]): void {
    this.add("DELETE", pattern, handler, middleware);
  }

  all(pattern: string, handler: RouteHandler, middleware?: string[]): void {
    this.add("*", pattern, handler, middleware);
  }

  notFound(handler: RouteHandler): void {
    this.notFoundHandler = handler;
  }

  onError(handler: (err: Error, ctx: RouteContext) => Response): void {
    this.errorHandler = handler;
  }

  match(method: string, pathname: string): RouteMatch | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase() && route.method !== "*") continue;
      const match = route.regex.exec(pathname);
      if (match) {
        const params: Record<string, string> = {};
        route.params.forEach((param, i) => {
          try {
            params[param] = decodeURIComponent(match[i + 1] ?? "");
          } catch {
            params[param] = match[i + 1] ?? ""; // Fallback: use raw value
          }
        });
        return { route, params };
      }
    }
    return null;
  }

  getNotFoundHandler(): RouteHandler | null {
    return this.notFoundHandler;
  }

  getErrorHandler(): ((err: Error, ctx: RouteContext) => Response) | null {
    return this.errorHandler;
  }

  size(): number {
    return this.routes.length;
  }

  list(): Route[] {
    return [...this.routes];
  }

  loadFromDir(pagesDir: string, basePath: string = "/"): void {
    if (!existsSync(pagesDir)) return;

    const files: string[] = [];
    this.collectFiles(pagesDir, ".tw", files, "");

    for (const file of files) {
      let routePath = file.replace(/\.tw$/, "").replace(/\\/g, "/");
      
      // Handle [slug].tw -> /slug/:slug
      const paramMatches = routePath.match(/\[([^\]]+)\]/g);
      if (paramMatches) {
        for (const match of paramMatches) {
          const paramName = match.slice(1, -1);
          routePath = routePath.replace(match, `:${paramName}`);
        }
      }

      // Handle index.tw -> /
      if (routePath.endsWith("/index")) {
        routePath = routePath.slice(0, -6) || "/";
      }

      // Handle catch-all [...slug].tw -> /slug/*
      routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, "*");

      const fullPattern = basePath === "/" ? routePath : `${basePath}${routePath}`;
      
      // Create handler that compiles and serves the .tw file
      const filePath = join(pagesDir, file + ".tw");
      this.get(fullPattern, async (ctx) => {
        try {
          const { compile } = await import("@tw/compiler");
          const source = await Bun.file(filePath).text();
          const result = await compile(source, { filePath, optimize: true });
          return new Response(result.html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } catch (err: any) {
          return new Response(`Internal Error: ${err.message}`, { status: 500 });
        }
      });
    }
  }

  private collectFiles(dir: string, ext: string, results: string[], relPath: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        this.collectFiles(fullPath, ext, results, join(relPath, entry));
      } else if (entry.endsWith(ext)) {
        results.push(join(relPath, entry.replace(ext, "")));
      }
    }
  }

  private patternToRegex(pattern: string): { regex: RegExp; params: string[] } {
    const params: string[] = [];
    
    // Handle wildcard
    if (pattern === "*") {
      return { regex: /^\/.*$/, params: [] };
    }

    // Handle catch-all [...param]
    let processed = pattern.replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => {
      params.push(name);
      return "(.*)";
    });

    // Handle optional params [[param]]
    processed = processed.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      params.push(name);
      return "([^/]+)?";
    });

    // Handle named params :param
    processed = processed.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      params.push(name);
      return "([^/]+)";
    });

    // Handle [param] (Next.js style)
    processed = processed.replace(/\[([^\]]+)\]/g, (_, name) => {
      params.push(name);
      return "([^/]+)";
    });

    // Escape special chars except our capture groups
    processed = processed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\(\\\[\\^\\\/\\\]\\+\\\]\\\)/g, "([^/]+)");

    // Simplify -- the above escaping messes things up. Let's do it properly.
    // Rebuild from original
    let regexStr = pattern;
    
    // Replace [param] with capture groups
    const paramRegex = /\[([^\]]+)\]/g;
    let paramMatch;
    let cleanRegex = pattern;
    const cleanParams: string[] = [];
    
    // Reset
    params.length = 0;
    
    cleanRegex = pattern;
    
    // Catch-all
    cleanRegex = cleanRegex.replace(/\[\.\.\.([^\]]+)\]/g, (_, name) => {
      params.push(name);
      return "(.*)";
    });
    
    // Optional params
    cleanRegex = cleanRegex.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      params.push(name);
      return "([^/]+)?";
    });
    
    // Named params :param
    cleanRegex = cleanRegex.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      params.push(name);
      return "([^/]+)";
    });
    
    // [param]
    cleanRegex = cleanRegex.replace(/\[([^\]]+)\]/g, (_, name) => {
      params.push(name);
      return "([^/]+)";
    });
    
    // Escape special chars that are NOT part of our regex
    cleanRegex = cleanRegex.replace(/[.+?^${}()|[\]\\]/g, (match) => {
      // Don't escape if it's part of a capture group
      return "\\" + match;
    });
    
    // Fix double-escaped capture groups
    cleanRegex = cleanRegex.replace(/\\\([^\\]\\\^\\\/\\\]\\+\\\)/g, "([^/]+)");

    // Actually, let's just build it properly from scratch
    const finalParams: string[] = [];
    let finalRegex = "^";
    let i = 0;
    while (i < pattern.length) {
      const ch = pattern[i];
      
      if (ch === "[" && pattern[i + 1] === "." && pattern[i + 2] === "." && pattern[i + 3] === ".") {
        // Catch-all [...param]
        const end = pattern.indexOf("]", i);
        let name = pattern.slice(i + 4, end);
        finalParams.push(name);
        finalRegex += "(.*)";
        i = end + 1;
      } else if (ch === "[" && pattern[i + 1] === "[") {
        // Optional [[param]]
        const end = pattern.indexOf("]]", i);
        const name = pattern.slice(i + 2, end);
        finalParams.push(name);
        finalRegex += "(?:([^/]+))?";
        i = end + 2;
      } else if (ch === "[") {
        // [param]
        const end = pattern.indexOf("]", i);
        const name = pattern.slice(i + 1, end);
        finalParams.push(name);
        finalRegex += "([^/]+)";
        i = end + 1;
      } else if (ch === ":") {
        // :param
        let name = "";
        i++;
        while (i < pattern.length && /[a-zA-Z0-9_]/.test(pattern[i])) {
          name += pattern[i];
          i++;
        }
        finalParams.push(name);
        finalRegex += "([^/]+)";
      } else if (ch === "*") {
        finalRegex += ".*";
        i++;
      } else if (".+?^${}()|[]\\".includes(ch)) {
        finalRegex += "\\" + ch;
        i++;
      } else {
        finalRegex += ch;
        i++;
      }
    }
    finalRegex += "$";

    return { regex: new RegExp(finalRegex), params: finalParams };
  }
}
