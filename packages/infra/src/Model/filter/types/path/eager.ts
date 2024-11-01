/* eslint-disable @typescript-eslint/no-explicit-any */
import { expectTypeOf } from "@effect/vitest"
import type { FieldValues } from "../fields.js"
import type { BrowserNativeObject, Extends, IsLiteral, IsNever, Primitive } from "../utils.js"

import type { ArrayKey, IsTuple, TupleKeys } from "./common.js"

/**
 * Helper type for recursively constructing paths through a type.
 * See {@link Path}
 */
type PathImpl<K extends string | number, V> = V extends
  | Primitive
  | BrowserNativeObject ? `${K}`
  : `${K}` | `${K}.${Path<V>}`

/**
 * Type which eagerly collects all paths through a type
 * @typeParam T - type which should be introspected
 * @example
 * ```
 * Path<{foo: {bar: string}}> = 'foo' | 'foo.bar'
 * ```
 */
export type Path<T> = T extends ReadonlyArray<infer V> ? IsTuple<T> extends true ? {
      [K in TupleKeys<T>]-?: PathImpl<K & string, T[K]>
    }[TupleKeys<T>]
  : PathImpl<ArrayKey, V>
  : {
    [K in keyof T]-?: PathImpl<K & string, T[K]>
  }[keyof T]

/**
 * See {@link Path}
 */
export type FieldPath<TFieldValues extends FieldValues> = Path<TFieldValues>

/**
 * Type to evaluate the type which the given path points to.
 * @typeParam T - deeply nested type which is indexed by the path
 * @typeParam P - path into the deeply nested type
 * @example
 * ```
 * PathValue<{foo: {bar: string}}, 'foo.bar'> = string
 * PathValue<[number, string], '1'> = string
 * ```
 */
/* dprint-ignore-start */
export type PathValue<T, P extends Path<T>> =
  T extends any
    ? P extends `${infer K}.${infer R}`
      ? K extends keyof T
        ? R extends Path<T[K]>
          ? PathValue<T[K], R>
          : never
        : K extends `${ArrayKey}`
          ? T extends ReadonlyArray<infer V>
            ? PathValue<V, R & Path<V>>
            : never
          : never
      : P extends keyof T
        ? T[P]
        : P extends `${ArrayKey}`
          ? T extends ReadonlyArray<infer V>
            ? V
            : never
          : never
    : never
/* dprint-ignore-end */

/**
 * See {@link PathValue}
 */
export type FieldPathValue<
  TFieldValues extends FieldValues,
  TFieldPath extends FieldPath<TFieldValues>
> = PathValue<TFieldValues, TFieldPath>

/* dprint-ignore-start */
export type SetPathValue<T, P extends Path<T>, X> =
  T extends any
    ? P extends `${infer K}.${infer R}`
      ? K extends keyof T
        ? R extends Path<T[K]>
          ? { [_ in keyof T]: _ extends K ? SetPathValue<T[K], R, X> : T[_] }
          : never
        : K extends `${ArrayKey}`
          ? T extends ReadonlyArray<infer V>
            ? { [_ in keyof T]: SetPathValue<V, R & Path<V>, X> }
            : never
          : never
      : P extends keyof T
        ? { [_ in keyof T]: _ extends P ? X : T[_] }
        : P extends `${ArrayKey}`
          ? T extends ReadonlyArray<any>
            ? { [_ in keyof T]: X }
            : never
          : never
    : never
/* dprint-ignore-end */

export type SetFieldPathValue<
  TFieldValues extends FieldValues,
  TFieldPath extends FieldPath<TFieldValues>,
  X
> = SetPathValue<TFieldValues, TFieldPath, X>

/* dprint-ignore-start */
export type RefinePathValue<T, P extends Path<T>, X, Exclde extends boolean = false> =
  T extends any
    ? P extends `${infer K}.${infer R}`
      ? K extends keyof T
        ? R extends Path<T[K]>
          ? { [_ in keyof T]: _ extends K ? RefinePathValue<T[K], R, X, Exclde> : T[_] }
          : never
        : K extends `${ArrayKey}`
          ? T extends ReadonlyArray<infer V>
            ? { [_ in keyof T]: RefinePathValue<V, R & Path<V>, X, Exclde> }
            : never
          : never
      : P extends keyof T
        ? X extends T[P]
          ? ({ [_ in keyof T]: _ extends P
              ? Extends<Exclde, true, Exclude<T[_], X>, IsLiteral<T[_], X, Extends<X, null, null, NonNullable<T[_]>>>>
              : T[_]
            }) extends infer $T
              ? Extends<IsNever<$T[P & keyof $T]>, true, never, $T>
              : never
          : Extends<Exclde, true, T, never>
        : P extends `${ArrayKey}`
          ? T extends ReadonlyArray<infer V>
            ? X extends V
              ? { [_ in keyof T]: Extends<Exclde, true,  Exclude<T[_], X>, IsLiteral<T[_], X, Extends<X, null, null, NonNullable<T[_]>>>> }
              : never
            : never
          : never
    : never
/* dprint-ignore-end */

export type RefineFieldPathValue<
  TFieldValues extends FieldValues,
  TFieldPath extends FieldPath<TFieldValues>,
  X,
  Exclde extends boolean = false
> = RefinePathValue<TFieldValues, TFieldPath, X, Exclde>

export namespace RefinePathValueTests {
  type test1 = RefineFieldPathValue<{ a: { b: "tag1"; v1: string } | { b: "tag2"; v2: number } }, "a.b", "tag1">
  expectTypeOf<test1>().toEqualTypeOf<{ a: { b: "tag1"; v1: string } }>()

  type test2 = RefineFieldPathValue<{ b: "tag1"; v1: string } | { b: "tag2"; v2: number }, "b", "tag1">
  expectTypeOf<test2>().toEqualTypeOf<{ b: "tag1"; v1: string }>()

  type test3 = RefineFieldPathValue<{ b: "tag1" | "tag2" }, "b", "tag1">
  expectTypeOf<test3>().toEqualTypeOf<{ b: "tag1" }>()

  type test4 = RefineFieldPathValue<{ b: ("tag1" | "tag2")[] }, `b.${number}`, "tag1">
  expectTypeOf<test4>().toEqualTypeOf<{ b: "tag1"[] }>()

  type test5 = RefineFieldPathValue<{ b: "tag1"; v1: unknown } | { b: "tag2"; v2: unknown }, "b", "tag1">
  expectTypeOf<test5>().toEqualTypeOf<{ b: "tag1"; v1: unknown }>()

  type test6 = RefineFieldPathValue<
    { a: { b: "tag1"; v1: string } | { b: "tag2"; v2: number } } | { something: "else " },
    "a.b",
    "tag2"
  >
  expectTypeOf<test6>().toEqualTypeOf<{ a: { b: "tag2"; v2: number } }>()

  type test7 = RefineFieldPathValue<{ b: string | null }, "b", "tag1">
  expectTypeOf<test7>().toEqualTypeOf<{ b: string }>()

  type test8 = RefineFieldPathValue<{ b: string | null }, "b", null>
  expectTypeOf<test8>().toEqualTypeOf<{ b: null }>()

  type test1E = RefineFieldPathValue<{ a: { b: "tag1"; v1: string } | { b: "tag2"; v2: number } }, "a.b", "tag1", true>
  expectTypeOf<test1E>().toEqualTypeOf<{ a: { b: "tag2"; v2: number } }>()

  type test2E = RefineFieldPathValue<{ b: "tag1"; v1: string } | { b: "tag2"; v2: number }, "b", "tag2", true>
  expectTypeOf<test2E>().toEqualTypeOf<{ b: "tag1"; v1: string }>()

  type test3E = RefineFieldPathValue<{ b: "tag1" | "tag2" | null }, "b", null, true>
  expectTypeOf<test3E>().toEqualTypeOf<{ b: "tag1" | "tag2" }>()

  type test4E = RefineFieldPathValue<{ b: ("tag1" | "tag2")[] }, `b.${number}`, "tag1", true>
  expectTypeOf<test4E>().toEqualTypeOf<{ b: "tag2"[] }>()

  type test5E = RefineFieldPathValue<{ b: "tag1"; v1: unknown } | { b: "tag2"; v2: unknown }, "b", "tag1", true>
  expectTypeOf<test5E>().toEqualTypeOf<{ b: "tag2"; v2: unknown }>()

  type test6E = RefineFieldPathValue<
    { a: { b: "tag1"; v1: string } | { b: "tag2"; v2: number } } | { something: "else " },
    "a.b",
    "tag2",
    true
  >
  expectTypeOf<test6E>().toEqualTypeOf<{ a: { b: "tag1"; v1: string } }>()
}

export namespace SetFieldPathValueTests {
  type test1 = SetFieldPathValue<{ foo: { bar: string[] } }, `foo.bar`, boolean>
  expectTypeOf<test1>().toEqualTypeOf<{ foo: { bar: boolean } }>()

  type test1a = SetFieldPathValue<{ foo: { bar: string[]; baz: 12 } }, `foo.bar`, boolean>
  expectTypeOf<test1a>().toEqualTypeOf<{ foo: { bar: boolean; baz: 12 } }>()

  type test2 = SetFieldPathValue<{ foo: { bar: string[] } }, `foo.bar.${number}`, boolean>
  expectTypeOf<test2>().toEqualTypeOf<{ foo: { bar: boolean[] } }>()

  type test2a = SetFieldPathValue<{ foo: { bar: readonly string[]; baz: 3 }; ban: 123 }, `foo.bar.${number}`, boolean>
  expectTypeOf<test2a>().toEqualTypeOf<{ foo: { bar: readonly boolean[]; baz: 3 }; ban: 123 }>()

  type test2b = SetFieldPathValue<
    { foo: { bar: readonly { a: 1; b: 2 }[]; baz: 3 }; ban: 123 },
    `foo.bar.${number}.b`,
    "b"
  >
  expectTypeOf<test2b>().toEqualTypeOf<{ foo: { bar: readonly { a: 1; b: "b" }[]; baz: 3 }; ban: 123 }>()

  type test3 = SetFieldPathValue<{ foo: ["a", "b"] }, `foo.0`, boolean>
  expectTypeOf<test3>().toEqualTypeOf<{ foo: [boolean, "b"] }>()

  type test3a = SetFieldPathValue<{ foo: [{ a: 123 }, "b"] }, `foo.0.a`, boolean>
  expectTypeOf<test3a>().toEqualTypeOf<{ foo: [{ a: boolean }, "b"] }>()
}

/**
 * Type to evaluate the type which the given paths point to.
 * @typeParam TFieldValues - field values which are indexed by the paths
 * @typeParam TPath        - paths into the deeply nested field values
 * @example
 * ```
 * FieldPathValues<{foo: {bar: string}}, ['foo', 'foo.bar']>
 *   = [{bar: string}, string]
 * ```
 */
export type FieldPathValues<
  TFieldValues extends FieldValues,
  TPath extends FieldPath<TFieldValues>[] | readonly FieldPath<TFieldValues>[]
> =
  & {}
  & {
    [K in keyof TPath]: FieldPathValue<
      TFieldValues,
      TPath[K] & FieldPath<TFieldValues>
    >
  }

/**
 * Type which eagerly collects all paths through a fieldType that matches a give type
 * @typeParam TFieldValues - field values which are indexed by the paths
 * @typeParam TValue       - the value you want to match into each type
 * @example
 * ```typescript
 * FieldPathByValue<{foo: {bar: number}, baz: number, bar: string}, number>
 *   = 'foo.bar' | 'baz'
 * ```
 */
export type FieldPathByValue<TFieldValues extends FieldValues, TValue> = {
  [Key in FieldPath<TFieldValues>]: FieldPathValue<
    TFieldValues,
    Key
  > extends TValue ? Key
    : never
}[FieldPath<TFieldValues>]
