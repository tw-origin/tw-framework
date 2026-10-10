/** Result types -- Ok/Err pattern for error handling. */

import { err, ok } from "./common";
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export { ok };

export { err };

export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw (result as any).error;
}

export { unwrapOr } from "./common";

export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (err: E) => T): T {
  return result.ok ? result.value : fn((result as any).error);
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : err((result as any).error);
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (err: E) => F): Result<T, F> {
  return result.ok ? ok(result.value) : err(fn((result as any).error));
}

export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : err((result as any).error);
}

export async function asyncOk<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await promise);
  } catch (e) {
    return err(e as Error);
  }
}
