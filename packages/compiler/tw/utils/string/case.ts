/**
 * Case conversion utilities used by the compiler.
 *
 * The canonical implementation lives in
 * `@tw/shared/tw/utils/string/transform`. These are re-exported rather than
 * reimplemented: the two copies had already drifted (this file's `dotCase`
 * dropped hyphens, the shared `titleCase` kept them), and a second copy is the
 * only way they can drift again.
 */

export {
  camelCase,
  capitalize,
  constantCase,
  dotCase,
  kebabCase,
  pascalCase,
  slugify,
  snakeCase,
  titleCase,
  truncate,
  uncapitalize,
} from "@tw/shared";

/** Path-style case (`some/path/here`). The shared package has no equivalent. */
export function pathCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1/$2")
    .replace(/[\s_.]+/g, "/")
    .toLowerCase();
}
