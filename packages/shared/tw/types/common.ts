/** Common shared types used across the TW framework. */

export type Maybe<T> = T | null | undefined;

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface Cloneable {
  clone(): this;
}

export interface Comparable<T> {
  compareTo(other: T): number;
}

export interface Equatable<T> {
  equals(other: T): boolean;
}

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Brand<T, B> = T & { __brand: B };

export interface Tagged<T extends string> {
  readonly _tag: T;
}

export function isSome<T>(val: Maybe<T>): val is T {
  return val !== null && val !== undefined;
}

export function isNone<T>(val: Maybe<T>): val is null | undefined {
  return val === null || val === undefined;
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw (result as any).error;
}

export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}
