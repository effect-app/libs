/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as D from "@effect-ts/core/Collections/Immutable/Dictionary"
import type { Dictionary } from "@effect-ts/core/Collections/Immutable/Dictionary"

export * from "./utils/extend.js"

export const unsafeRight = <E, A>(ei: Either<E, A>) => {
  if (ei.isLeft()) {
    console.error(ei.left)
    throw ei.left
  }
  return ei.right
}

export const unsafeSome = (makeErrorMessage: () => string) =>
  <A>(o: Opt<A>) => {
    if (o.isNone()) {
      throw new Error(makeErrorMessage())
    }
    return o.value
  }

export function toString(v: unknown) {
  return `${v}`
}

export const isTruthy = <T>(item: T | null | undefined): item is T => Boolean(item)
export const typedKeysOf = <T extends {}>(obj: T) => Object.keys(obj) as (keyof T)[]
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
export const typedValuesOf = <T extends {}>(obj: T) => Object.values(obj) as ValueOf<T>[]
type ValueOf<T> = T[keyof T]

export type Constructor<T = any> = { new(...args: any[]): T }
export type ThenArg<T> = T extends Promise<infer U> ? U
  : T extends (...args: any[]) => Promise<infer V> ? V
  : T

export function dropUndefined<A>(
  input: Dictionary<A | undefined>
): Dictionary<A> {
  const newR = pipe(
    input,
    D.filter((x): x is A => x !== undefined)
  )
  return newR
}

type GetTag<T> = T extends { _tag: infer K } ? K : never
export const isOfType = <T extends { _tag: string }>(tag: GetTag<T>) => (e: { _tag: string }): e is T => e._tag === tag

export function capitalize<T extends string>(string: T): Capitalize<T> {
  return (string.charAt(0).toUpperCase() + string.slice(1)) as Capitalize<T>
}

export function uncapitalize<T extends string>(string: T): Uncapitalize<T> {
  return (string.charAt(0).toLowerCase() + string.slice(1)) as Uncapitalize<T>
}

export function pretty(o: unknown) {
  // JSON.stringify(undefined) ends up with undefined!
  return JSON.stringify(o, undefined, 2) ?? "undefined"
}
