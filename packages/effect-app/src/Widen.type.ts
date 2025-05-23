/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BuiltInObject } from "effect-app/utils"

type AllKeys<T> = T extends any ? keyof T : never

type OptionalKeys<T> = T extends any ? { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T]
  : never

type Idx<T, K extends PropertyKey, D = never> = T extends any ? K extends keyof T ? T[K]
  : D
  : never

type PartialKeys<T, K extends keyof T> =
  & Omit<T, K>
  & Partial<Pick<T, K>> extends infer O ? { [P in keyof O]: O[P] }
  : never

export type Primitive = boolean | string | number | bigint | symbol | undefined | null
export type Widen<T> = [T] extends [BuiltInObject] | [Primitive] ? T
  : [T] extends [Array<unknown>] ? { [K in keyof T]: Widen<T[K]> }
  : [T] extends [ReadonlyArray<unknown>] ? { [K in keyof T]: Widen<T[K]> }
  : [T] extends [object] ? PartialKeys<
      { [K in AllKeys<T>]: Widen<Idx<T, K>> },
      Exclude<AllKeys<T>, keyof T> | OptionalKeys<T>
    >
  : T
