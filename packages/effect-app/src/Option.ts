/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { getOrUndefined as value, type Some } from "effect/Option"
import * as Option from "effect/Option"

export * from "effect/Option"

export const getOrUndefined = value

export function omitableToNullable<T>(om: Option.Option<T> | undefined) {
  return om ?? Option.fromNullable(om)
}

export const toBool = Option.match({
  onNone: () => false,
  onSome: () => true
})

export const fromBool = (b: boolean) => (b ? Option.some(true) : Option.none())

/**
 * Access property, unwrapping Options along the path
 */
export function p<T, K extends KeysMatching<T, Option.Option<any>>>(
  k: K
): (v: Option.Option<T>) => Option.Option<_A<T[K]>>
export function p<T, K extends keyof T>(k: K): (v: Option.Option<T>) => Option.Option<T[K]>
export function p<T>(k: any) {
  return (v: Option.Option<T>) => Option.flatMap(v, (a) => convert((a as any)[k]))
}
function convert(a: any) {
  return Option.isSome(a) || Option.isNone(a) ? a : Option.fromNullable(a)
}
export type _A<A> = A extends Some<infer Y> ? Y : never
type KeysMatching<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never
}[keyof T]

export const PartialExceptionTypeId = Symbol()
export type PartialExceptionTypeId = typeof PartialExceptionTypeId

export class PartialException {
  readonly _typeId: PartialExceptionTypeId = PartialExceptionTypeId
}

function raisePartial<X>(): X {
  throw new PartialException()
}

/**
 * Simulates a partial function
 */
export function partial<ARGS extends any[], A>(
  f: (miss: <X>() => X) => (...args: ARGS) => A
): (...args: ARGS) => Option.Option<A> {
  return (...args) => {
    try {
      return Option.some(f(raisePartial)(...args))
    } catch (e) {
      if (e instanceof PartialException) {
        return Option.none()
      }
      throw e
    }
  }
}
