/** Builtin functions and filters for TW expressions. */

import { Sandbox } from "./sandbox";
import { isTruthy } from "./evaluate";

export function callBuiltin(fn: string, arg: string, sandbox: Sandbox): string {
  // The switch below is a fixed, framework-defined set of pure string
  // transforms with a pass-through default -- it never evaluates anything
  // dynamic. Gating it on sandbox.isAllowed() (whose allowlist contains
  // GLOBALS like Math/JSON) refused every filter name and silently returned
  // "", making the whole pipe/filter feature dead code.
  switch (fn) {
    // String functions
    case "len": case "length": return String(arg.length);
    case "upper": case "uppercase": return arg.toUpperCase();
    case "lower": case "lowercase": return arg.toLowerCase();
    case "trim": return arg.trim();
    case "reverse": return arg.split("").reverse().join("");
    case "capitalize": return arg.charAt(0).toUpperCase() + arg.slice(1);
    case "title": return arg.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case "camelCase": return arg.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase());
    case "kebabCase": return arg.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/\s+/g, "-");
    case "snakeCase": return arg.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/\s+/g, "_");
    case "repeat": return arg; // needs second arg
    case "padStart": return arg; // needs second arg
    case "padEnd": return arg; // needs second arg
    case "startsWith": return arg; // needs second arg
    case "endsWith": return arg; // needs second arg
    case "includes": return arg; // needs second arg
    case "indexOf": return arg; // needs second arg
    case "slice": return arg; // needs second arg
    case "split": return arg; // needs second arg
    case "replace": return arg; // needs second arg

    // Math functions
    case "round": return String(Math.round(parseFloat(arg) || 0));
    case "floor": return String(Math.floor(parseFloat(arg) || 0));
    case "ceil":  return String(Math.ceil(parseFloat(arg) || 0));
    case "abs":   return String(Math.abs(parseFloat(arg) || 0));
    case "sqrt":  return String(Math.sqrt(parseFloat(arg) || 0));
    case "pow":   return arg; // needs second arg
    case "min":   return arg; // needs second arg
    case "max":   return arg; // needs second arg
    case "random": return String(Math.random());
    case "sin":   return String(Math.sin(parseFloat(arg) || 0));
    case "cos":   return String(Math.cos(parseFloat(arg) || 0));
    case "tan":   return String(Math.tan(parseFloat(arg) || 0));
    case "log":   return String(Math.log(parseFloat(arg) || 0));
    case "exp":   return String(Math.exp(parseFloat(arg) || 0));

    // Type conversion
    case "int": case "parseInt": return String(parseInt(arg, 10) || 0);
    case "float": case "parseFloat": return String(parseFloat(arg) || 0);
    case "str": case "String": return String(arg);
    case "bool": case "Boolean": return isTruthy(arg) ? "true" : "false";
    case "num": case "Number": return String(parseFloat(arg) || 0);

    // JSON
    case "json": try { return JSON.stringify(JSON.parse(arg)); } catch { return arg; }
    case "parseJSON": try { return JSON.parse(arg); } catch { return ""; }
    case "stringify": return JSON.stringify(arg);

    // Date
    case "now": return new Date().toISOString();
    case "date": return new Date(arg).toLocaleDateString();
    case "time": return new Date(arg).toLocaleTimeString();

    // Encoding
    case "encodeURI": return encodeURIComponent(arg);
    case "decodeURI": return decodeURIComponent(arg);
    case "base64encode": return btoa(arg);
    case "base64decode": return atob(arg);

    // Regex
    case "match": return arg; // needs pattern arg
    case "test": return arg; // needs pattern arg

    // Array functions
    case "join": return arg; // needs separator arg
    case "first": try { const arr = JSON.parse(arg); return Array.isArray(arr) ? String(arr[0] ?? "") : ""; } catch { return ""; }
    case "last": try { const arr = JSON.parse(arg); return Array.isArray(arr) ? String(arr[arr.length - 1] ?? "") : ""; } catch { return ""; }
    case "size": try { const arr = JSON.parse(arg); return Array.isArray(arr) ? String(arr.length) : "0"; } catch { return "0"; }

    default: return arg;
  }
}



export function applyFilter(value: string, filter: string, args: string, vars: Record<string, string>, sandbox: Sandbox): string {
  return callBuiltin(filter, value, sandbox);
}

