/* eslint-disable @typescript-eslint/no-explicit-any */
import { Option } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import type { Misc, Union } from "ts-toolbelt"
import type * as SET from "./Set.js"

// type SomeObject = {
//   0: Option.Option<string>
//   a: {
//     b: Option.Option<string>
//     g: Option.Option<Option<string>>
//     h: Option.Option<{ i: Option.Option<boolean> }>
//   }
//   c: { d: Array<Option<{ e: Option.Option<boolean> }>> }
// }
// type test0 = Transform<SomeObject>
// type test1 = Transform<SomeObject[]>

type OptOf<A> = Union.Exclude<
  A extends Option.Some<infer X> ? X | null : A,
  Option.None<any>
>
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export type TransformRoot<O> = O extends Option.Option<any> ? Transform<OptOf<O>>
  : Transform<O>
export type Transform<O> = O extends Misc.BuiltIn | Misc.Primitive ? O
  : {
    [K in keyof O]: OptOf<O[K]> extends infer X ? X extends (infer Y)[] ? OptOf<Transform<Y>>[]
      : X extends NonEmptyReadonlyArray<infer Y> ? NonEmptyReadonlyArray<OptOf<Transform<Y>>>
      : X extends SET.Set<infer Y> ? SET.Set<OptOf<Transform<Y>>>
      : X extends readonly (infer Y)[] ? readonly OptOf<Transform<Y>>[]
      : Transform<X>
      : never
  }

export const encodeOptsAsNullable = <T>(root: T): TransformRoot<T> => encodeOptsAsNullable_(root, new Map())

const encodeOptsAsNullable_ = (value: any, cacheMap: Map<any, any>): any => {
  const cacheEntry = cacheMap.get(value)
  if (cacheEntry) {
    return cacheEntry
  }

  if (Array.isArray(value)) {
    const newAr: typeof value = []
    cacheMap.set(value, newAr)
    value.forEach((x) => newAr.push(encodeOptsAsNullable_(x, cacheMap)))
    return newAr
  }

  if (
    value instanceof Date
    || value instanceof Function
    || value instanceof Promise
  ) {
    return value
  }

  if (value instanceof Set) {
    const newValue = [...value]
    cacheMap.set(value, newValue)
    return newValue
  }

  if (value instanceof Object) {
    if (value._tag === "Some" || value._tag === "None") {
      const v = value as Option.Option<unknown>
      return encodeOptsAsNullable_(Option.getOrNull(v), cacheMap)
    }
    const newObj = {} as Record<string, any>
    cacheMap.set(value, newObj)

    Object.keys(value).forEach((key) => {
      newObj[key] = encodeOptsAsNullable_(value[key], cacheMap)
    })
    return newObj
  }
  return value
}
