/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Effect, Option, pipe, type SchemaAST } from "effect"
import type { Tag } from "effect/Context"
import * as Getter from "effect/SchemaGetter"
import * as Issue from "effect/SchemaIssue"
import * as S from "effect/Schema"
import { type NonEmptyReadonlyArray } from "../Array.js"
import { extendM, typedKeysOf } from "../utils.js"
import { type AST } from "./schema.js"

export const withDefaultConstructor = <A>(
  makeDefault: () => NoInfer<A>
) =>
(self: S.Top): any =>
  (self as any).pipe(S.withConstructorDefault(() => Option.some(makeDefault())))

/**
 * Like the default Schema `Date` but with `withDefault` => now
 */
export const Date = Object.assign(S.Date, {
  withDefault: S.Date.pipe(withDefaultConstructor(() => new global.Date()))
})

/**
 * Like the default Schema `Boolean` but with `withDefault` => false
 */
export const Boolean = Object.assign(S.Boolean, {
  withDefault: S.Boolean.pipe(withDefaultConstructor(() => false))
})

/**
 * Like the default Schema `Number` but with `withDefault` => 0
 */
export const Number = Object.assign(S.Number, { withDefault: S.Number.pipe(withDefaultConstructor(() => 0)) })

/**
 * Like the default Schema `Literal` but with `withDefault` => literals[0]
 */
export const Literal = <Literals extends NonEmptyReadonlyArray<AST.LiteralValue>>(...literals: Literals) =>
  pipe(
    (S.Literal as any)(...literals),
    (s) =>
      Object.assign(s, {
        changeDefault: <A extends Literals[number]>(a: A) => {
          return Object.assign((S.Literal as any)(...literals), {
            Default: a,
            withDefault: s.pipe(withDefaultConstructor(() => a))
          }) // todo: copy annotations from original?
        },
        Default: literals[0] as typeof literals[0],
        withDefault: s.pipe(withDefaultConstructor(() => literals[0]))
      })
  )

/**
 * Like the default Schema `Array` but with `withDefault` => []
 */
export function Array<Value extends S.Top>(value: Value) {
  return pipe(
    S.Array(value),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => [])) })
  )
}

/**
 * Like the default Schema `ReadonlyMap` but with `withDefault` => new Map()
 * (wraps as ReadonlyMap in v4)
 */
function Map_<Key extends S.Top, Value extends S.Top>(input: { key: Key; value: Value }) {
  return pipe(
    S.ReadonlyMap(input.key, input.value),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => new global.Map())) })
  )
}

export { Map_ as Map }

/**
 * Like the default Schema `ReadonlySet` but with `withDefault` => new Set()
 */
export const ReadonlySet = <Value extends S.Top>(value: Value) =>
  pipe(
    S.ReadonlySet(value),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => new Set<S.Schema.Type<Value>>())) })
  )

/**
 * Like the default Schema `ReadonlyMap` but with `withDefault` => new Map()
 */
export const ReadonlyMap = <K extends S.Top, V extends S.Top>(pair: {
  readonly key: K
  readonly value: V
}) =>
  pipe(
    S.ReadonlyMap(pair.key, pair.value),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => new Map())) })
  )

/**
 * Like the default Schema `NullOr` but with `withDefault` => null
 */
export const NullOr = <T extends S.Top>(self: T) =>
  pipe(
    S.NullOr(self),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => null)) })
  )

export const defaultDate = (s: S.Top) => s.pipe(withDefaultConstructor(() => new global.Date()))

export const defaultBool = (s: S.Top) => s.pipe(withDefaultConstructor(() => false))

export const defaultNullable = (s: S.Top) => s.pipe(withDefaultConstructor(() => null))

export const defaultArray = (s: S.Top) => s.pipe(withDefaultConstructor(() => []))

export const defaultMap = (s: S.Top) => s.pipe(withDefaultConstructor(() => new Map()))

export const defaultSet = (s: S.Top) => s.pipe(withDefaultConstructor(() => new Set()))

export const withDefaultMake = <Self extends S.Top>(s: Self) => {
  const a = Object.assign(S.decodeSync(s as any) as WithDefaults<Self>, s)
  Object.setPrototypeOf(a, s)
  return a
}

export type WithDefaults<Self extends S.Top> = (
  i: Self["Encoded"],
  options?: SchemaAST.ParseOptions
) => Self["Type"]

export const inputDate = extendM(
  // S.DateValid is the v4 equivalent of S.ValidDateFromSelf (valid Date object)
  S.DateValid,
  (s) => ({ withDefault: s.pipe(withDefaultConstructor(() => new globalThis.Date())) })
)

export interface UnionBrand {}

export function makeOptional<NER extends S.Struct.Fields>(
  t: NER // TODO: enforce non empty
): any {
  return typedKeysOf(t).reduce((prev, cur) => {
    prev[cur] = S.optional(t[cur] as any)
    return prev
  }, {} as any)
}

export function makeExactOptional<NER extends S.Struct.Fields>(
  t: NER // TODO: enforce non empty
): any {
  return typedKeysOf(t).reduce((prev, cur) => {
    prev[cur] = S.optionalKey(t[cur] as any)
    return prev
  }, {} as any)
}

/** A version of transform which is only a one way mapping of From->To */
export const transformTo = <To extends S.Top, From extends S.Top>(
  from: From,
  to: To,
  decode: (
    fromA: From["Type"]
  ) => To["Encoded"]
) =>
  from.pipe(
    S.decodeTo(to, {
      decode: Getter.transform(decode),
      encode: Getter.forbidden(() => "One way schema transformation, encoding is not allowed")
    }) as any
  )

/** A version of transformOrFail which is only a one way mapping of From->To */
export const transformToOrFail = <To extends S.Top, From extends S.Top, RD>(
  from: From,
  to: To,
  decode: (
    fromA: From["Type"],
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<To["Encoded"], Issue.Issue, RD>
) =>
  from.pipe(
    S.decodeTo(to, {
      decode: Getter.transformOrFail<To["Encoded"], From["Type"], RD>(
        (fromA, options) => decode(fromA, options)
      ),
      encode: Getter.forbidden(() => "One way schema transformation, encoding is not allowed")
    }) as any
  )

/**
 * TODO: v4 migration - Effect.context() and S.declare with decode/encode removed.
 * This function needs a new approach using the v4 API.
 * For now it returns the schema unchanged as a stub.
 */
export const provide = <Self extends S.Top>(
  self: Self,
  _context: any // TODO: support Context<R>
): any => {
  return self as any
}

/**
 * TODO: v4 migration - Effect.context() is removed in v4.
 * This function needs a new approach using the v4 API.
 * For now it returns Effect.succeed(self) as a stub.
 */
export const contextFromServices = <Self extends S.Top, Tags extends readonly Tag<any, any>[]>(
  self: Self,
  ..._services: Tags
): Effect.Effect<
  any,
  never,
  { [K in keyof Tags]: Tag.Identifier<Tags[K]> }[number]
> =>
  // TODO: rethink this approach for v4 - Effect.context() is removed
  Effect.succeed(self) as any
