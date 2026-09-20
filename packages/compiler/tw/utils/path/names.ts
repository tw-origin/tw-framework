/** Path name extraction utilities. */

import { splitExt } from "./normalize";

export function getBaseName(path: string): string {
  const { dir, name, ext } = splitExt(path);
  void dir;
  return name + ext;
}

export function getFileName(path: string): string {
  return splitExt(path).name;
}

export function getExtension(path: string): string {
  return splitExt(path).ext.toLowerCase();
}

export function getDirName(path: string): string {
  return splitExt(path).dir;
}

export function getExtensionNoDot(path: string): string {
  const ext = getExtension(path);
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

export function hasExtension(path: string, ext: string): boolean {
  const normalizedExt = ext.startsWith(".") ? ext.toLowerCase() : "." + ext.toLowerCase();
  return getExtension(path) === normalizedExt;
}

export function replaceExtension(path: string, newExt: string): string {
  const { dir, name } = splitExt(path);
  const ext = newExt.startsWith(".") ? newExt : "." + newExt;
  if (dir === ".") return name + ext;
  return dir + "/" + name + ext;
}

export function removeExtension(path: string): string {
  const { dir, name } = splitExt(path);
  if (dir === ".") return name;
  return dir + "/" + name;
}

export function changeCase(path: string, toCase: "lower" | "upper"): string {
  return toCase === "lower" ? path.toLowerCase() : path.toUpperCase();
}

export function isPath(str: string): boolean {
  return str.includes("/") || str.includes("\\") || str.startsWith(".");
}

export function isFilePath(str: string): boolean {
  return isPath(str) && getExtension(str).length > 0;
}

export function isDirPath(str: string): boolean {
  return isPath(str) && getExtension(str).length === 0;
}
