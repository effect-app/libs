/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Effect, Option as Option_, pipe, type SchemaAST, type ServiceMap } from "effect"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaParser from "effect/SchemaParser"
import * as S from "effect/Schema"
import { type NonEmptyReadonlyArray } from "../Array.js"
import * as Context from "../Context.js"
import { extendM, typedKeysOf } from "../utils.js"
import { type AST } from "./schema.js"

export const withDefaultConstructor = <A>(
  makeDefault: () => NoInfer<A>
) => (self: any): any =>
  S.withConstructorDefault((_: Option_.Option<undefined>) => Option_.some(makeDefault()))(self)

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
    S.Literal(...(literals as readonly [AST.LiteralValue, ...AST.LiteralValue[]])),
    (s) =>
      Object.assign(s, {
        changeDefault: <A extends Literals[number]>(a: A) => {
          return Object.assign(S.Literal(...(literals as readonly [AST.LiteralValue, ...AST.LiteralValue[]])), {
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
 * Like the default Schema `Map` but with `withDefault` => []
 */
function Map_<Key extends S.Top, Value extends S.Top>(input: { key: Key; value: Value }) {
  return pipe(
    (S as any).Map(input),
    (s: any) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => new global.Map())) })
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
export const NullOr = <Self extends S.Top>(self: Self) =>
  pipe(
    S.NullOr(self),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => null)) })
  )

export const defaultDate = (s: any) => s.pipe(withDefaultConstructor(() => new global.Date()))

export const defaultBool = (s: any) => s.pipe(withDefaultConstructor(() => false))

export const defaultNullable = (s: any) => s.pipe(withDefaultConstructor(() => null))

export const defaultArray = (s: any) => s.pipe(withDefaultConstructor(() => []))

export const defaultMap = (s: any) => s.pipe(withDefaultConstructor(() => new Map()))

export const defaultSet = (s: any) => s.pipe(withDefaultConstructor(() => new Set()))

export const withDefaultMake = <Self extends S.Top & { readonly DecodingServices: never }>(s: Self) => {
  const a = Object.assign(SchemaParser.decodeUnknownSync(s) as WithDefaults<Self>, s)
  Object.setPrototypeOf(a, s)
  return a
}

export type WithDefaults<Self extends S.Top> = (
  i: Self["Encoded"],
  options?: SchemaAST.ParseOptions
) => Self["Type"]

export const inputDate = extendM(
  S.Union([(S as any).ValidDateFromSelf ?? S.Date, S.Date] as any),
  (s) => ({ withDefault: s.pipe(withDefaultConstructor(() => new globalThis.Date())) })
)

export interface UnionBrand {}

const makeOpt = (self: any, exact?: boolean): any => {
  const ast = self.ast
  switch (ast._tag) {
    case "PropertySignatureDeclaration": {
      return (S as any).makePropertySignature(
        new (S as any).PropertySignatureDeclaration(
          exact ? ast.type : S.UndefinedOr(S.make(ast.type)).ast,
          true,
          ast.isReadonly,
          ast.annotations,
          ast.defaultValue
        )
      )
    }
    case "PropertySignatureTransformation": {
      return (S as any).makePropertySignature(
        new (S as any).PropertySignatureTransformation(
          new (S as any).FromPropertySignature(
            exact ? ast.from.type : S.UndefinedOr(S.make(ast.from.type)).ast,
            true,
            ast.from.isReadonly,
            ast.from.annotations
          ),
          new (S as any).ToPropertySignature(
            exact ? ast.to.type : S.UndefinedOr(S.make(ast.to.type)).ast,
            true,
            ast.to.isReadonly,
            ast.to.annotations,
            ast.to.defaultValue
          ),
          ast.decode,
          ast.encode
        )
      )
    }
  }
}

export function makeOptional<NER extends S.Struct.Fields | any>(
  t: NER // TODO: enforce non empty
): any {
  return typedKeysOf(t).reduce((prev: any, cur: any) => {
    if (S.isSchema(t[cur])) {
      prev[cur] = S.optional(t[cur] as any)
    } else {
      prev[cur] = makeOpt(t[cur] as any)
    }
    return prev
  }, {} as any)
}

export function makeExactOptional<NER extends S.Struct.Fields>(
  t: NER // TODO: enforce non empty
): any {
  return typedKeysOf(t).reduce((prev: any, cur: any) => {
    if (S.isSchema(t[cur])) {
      prev[cur] = S.optionalKey(t[cur] as any)
    } else {
      prev[cur] = makeOpt(t[cur] as any, true)
    }
    return prev
  }, {} as any)
}

/** A version of transform which is only a one way mapping of From->To */
export const transformTo = <To extends S.Top, From extends S.Top>(
  from: From,
  to: To,
  decode: (
    fromA: From["Type"],
    options: SchemaAST.ParseOptions,
    ast: any,
    fromI: From["Encoded"]
  ) => To["Encoded"]
): any =>
  (S as any).transformOrFail(
    from,
    to,
    {
      decode: (...args: any[]) => Effect.sync(() => (decode as any)(...args)),
      encode: (i: any, _: any, _ast: any) =>
        Effect.fail(
          new SchemaIssue.Forbidden(
            Option_.some(i),
            { message: "One way schema transformation, encoding is not allowed" }
          )
        )
    }
  )

/** A version of transformOrFail which is only a one way mapping of From->To */
export const transformToOrFail = <To extends S.Top, From extends S.Top, RD>(
  from: From,
  to: To,
  decode: (
    fromA: From["Type"],
    options: SchemaAST.ParseOptions,
    ast: any
  ) => Effect.Effect<To["Encoded"], SchemaIssue.Issue, RD>
): any =>
  (S as any).transformOrFail(from, to, {
    decode,
    encode: (i: any, _: any, _ast: any) =>
      Effect.fail(
        new SchemaIssue.Forbidden(
          Option_.some(i),
          { message: "One way schema transformation, encoding is not allowed" }
        )
      )
  })

export const provide = <Self extends S.Top, R>(
  self: Self,
  context: Context.Context<R> // TODO: support Layers?
): any => {
  const provide_ = Effect.provide(context)
  return (S as any)
    .declare([self], {
      decode: (t: any) => (n: any) => provide_(SchemaParser.decodeUnknownEffect(t)(n)),
      encode: (t: any) => (n: any) => provide_(SchemaParser.encodeUnknownEffect(t)(n))
    }) as any
}

export const contextFromServices = <Self extends S.Top, Tags extends readonly ServiceMap.Service<any, any>[]>(
  self: Self,
  ...services: Tags
): Effect.Effect<any, never, any> =>
  Effect.gen(function*() {
    const context = Context.pick(...services)(yield* Effect.services())
    const provide_ = Effect.provide(context)
    return (S as any)
      .declare([self], {
        decode: (t: any) => (n: any) => provide_(SchemaParser.decodeUnknownEffect(t)(n)),
        encode: (t: any) => (n: any) => provide_(SchemaParser.encodeUnknownEffect(t)(n))
      })
  }) as any
