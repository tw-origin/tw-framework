/** Relative path computation utilities. */

import { normalizePath, splitPath } from "./normalize";

export function relativePath(from: string, to: string): string {
  const fromParts = splitPath(normalizePath(from));
  const toParts = splitPath(normalizePath(to));

  // Remove filename from 'from' if it's a file
  const fromExt = fromParts[fromParts.length - 1]?.includes(".") ?? false;
  if (fromExt) fromParts.pop();

  let commonLen = 0;
  while (
    commonLen < fromParts.length &&
    commonLen < toParts.length &&
    fromParts[commonLen] === toParts[commonLen]
  ) {
    commonLen++;
  }

  const upCount = fromParts.length - commonLen;
  const remaining = toParts.slice(commonLen);

  const parts: string[] = [];
  for (let i = 0; i < upCount; i++) {
    parts.push("..");
  }
  parts.push(...remaining);

  return parts.length > 0 ? parts.join("/") : ".";
}

export function isSubpath(parent: string, child: string): boolean {
  const parentNorm = normalizePath(parent);
  const childNorm = normalizePath(child);
  return childNorm.startsWith(parentNorm + "/");
}

export function depth(from: string, to: string): number {
  const rel = relativePath(from, to);
  return rel.split("/").filter((p) => p === "..").length;
}

export function resolvePath(base: string, target: string): string {
  if (target.startsWith("/")) return normalizePath(target);
  if (target.startsWith("./")) target = target.slice(2);

  const baseParts = splitPath(normalizePath(base));
  const targetParts = target.split("/");

  // Remove filename from base
  if (baseParts.length > 0 && baseParts[baseParts.length - 1].includes(".")) {
    baseParts.pop();
  }

  for (const part of targetParts) {
    if (part === "..") {
      baseParts.pop();
    } else if (part !== "." && part !== "") {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}
