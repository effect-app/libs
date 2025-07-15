/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Data, flow, type Option, Pipeable, type S } from "effect-app"
import type { NonNegativeInt } from "effect-app/Schema"
import type { Covariant } from "effect/Types"
import type { Ops } from "../filter/filterApi.js"
import type { FieldValues } from "../filter/types.js"
import type { FieldPath, FieldPathValue, RefineFieldPathValue } from "../filter/types/path/eager.js"

export type QAll<
  TFieldValues extends FieldValues,
  TFieldValuesRefined extends TFieldValues = TFieldValues,
  A = TFieldValues,
  R = never,
  TType extends "one" | "many" = "many",
  Exclusive extends boolean = false
> =
  | Query<TFieldValues>
  | QueryWhere<TFieldValues, TFieldValuesRefined, Exclusive>
  | QueryEnd<TFieldValues, TType, Exclusive>
  | QueryProjection<TFieldValues, A, R, TType, Exclusive>

export const QId = Symbol()
export type QId = typeof QId

export interface QueryTogether<
  out TFieldValues extends FieldValues,
  out TFieldValuesRefined extends TFieldValues = TFieldValues,
  out Exclusive extends boolean = false,
  out T extends "initial" | "where" | "end" | "projection" = "initial",
  out A = TFieldValues,
  out R = never,
  out TType extends "many" | "one" | "count" = "many"
> extends Pipeable.Pipeable {
  readonly [QId]: {
    readonly _TFieldValues: Covariant<TFieldValues>
    readonly _T: Covariant<T>
    readonly _TFieldValuesRefined: Covariant<TFieldValuesRefined>
    readonly _A: Covariant<A>
    readonly _R: Covariant<R>
    readonly _TT: Covariant<TType>
    readonly _Exclusive: Covariant<Exclusive>
  }
}

type ExtractTType<T> = T extends QueryTogether<any, any, any, any, any, any, infer TType> ? TType : never
type ExtractExclusiveness<T> = T extends QueryTogether<any, any, infer Exclusive extends boolean, any, any, any, any>
  ? Exclusive
  : never
type ExtractFieldValuesRefined<T> = T extends QueryTogether<any, infer TFieldValuesRefined, any, any, any, any, any>
  ? TFieldValuesRefined
  : never

export type RelationDirection = "some" | "every"
export type Relation = { relation: RelationDirection }
export type Query<TFieldValues extends FieldValues> = QueryTogether<TFieldValues, TFieldValues, false, "initial">
export type QueryWhere<
  TFieldValues extends FieldValues,
  TFieldValuesRefined extends TFieldValues = TFieldValues,
  Exclusive extends boolean = false
> =
  & QueryTogether<
    TFieldValues,
    TFieldValuesRefined,
    Exclusive,
    "where"
  >
  & Relation

export type QueryEnd<
  TFieldValues extends FieldValues,
  TType extends "many" | "one" | "count" = "many",
  Exclusive extends boolean = false
> = QueryTogether<
  TFieldValues,
  TFieldValues,
  Exclusive,
  "end",
  TFieldValues,
  never,
  TType
>

export type QueryProjection<
  TFieldValues extends FieldValues,
  A = TFieldValues,
  R = never,
  TType extends "many" | "one" | "count" = "many",
  Exclusive extends boolean = false
> = QueryTogether<
  TFieldValues,
  TFieldValues,
  Exclusive,
  "projection",
  A,
  R,
  TType
>
export type Q<TFieldValues extends FieldValues> =
  | Initial<TFieldValues>
  | Where<TFieldValues>
  | And<TFieldValues>
  | Or<TFieldValues>
  | Order<TFieldValues, any>
  | Page<TFieldValues>
  | Project<any, TFieldValues, any>
  | One<TFieldValues>
  | Count<TFieldValues>

export class Initial<TFieldValues extends FieldValues> extends Data.TaggedClass("value")<{ value: "initial" }>
  implements Query<TFieldValues>
{
  readonly [QId]!: any
  constructor() {
    super({ value: "initial" as const })
  }
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Where<TFieldValues extends FieldValues> extends Data.TaggedClass("where")<{
  current: Query<TFieldValues>
  operation: [string, Ops, any] | [string, any] | ((q: Query<TFieldValues>) => QueryWhere<TFieldValues>)
  relation: RelationDirection
  subPath?: string
}> implements QueryWhere<TFieldValues> {
  readonly [QId]!: any

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class And<TFieldValues extends FieldValues> extends Data.TaggedClass("and")<{
  current: Query<TFieldValues>
  operation: [string, Ops, any] | [string, any] | ((q: Query<TFieldValues>) => QueryWhere<TFieldValues>)
  relation: RelationDirection
}> implements QueryWhere<TFieldValues> {
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Or<TFieldValues extends FieldValues> extends Data.TaggedClass("or")<{
  current: Query<TFieldValues>
  operation: [string, Ops, any] | [string, any] | ((q: Query<TFieldValues>) => QueryWhere<TFieldValues>)
  relation: RelationDirection
}> implements QueryWhere<TFieldValues> {
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Page<TFieldValues extends FieldValues> extends Data.TaggedClass("page")<{
  current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues>
  take?: number | undefined
  skip?: number | undefined
}> implements QueryEnd<TFieldValues> {
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class One<TFieldValues extends FieldValues> extends Data.TaggedClass("one")<{
  current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues>
}> implements QueryEnd<TFieldValues, "one"> {
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Count<TFieldValues extends FieldValues> extends Data.TaggedClass("count")<{
  current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues>
}> implements QueryEnd<TFieldValues, "count"> {
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Order<TFieldValues extends FieldValues, TFieldName extends FieldPath<TFieldValues>>
  extends Data.TaggedClass("order")<{
    current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues>
    field: TFieldName
    direction: "ASC" | "DESC"
  }>
  implements QueryEnd<TFieldValues>
{
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Project<A, TFieldValues extends FieldValues, R, TType extends "one" | "many" = "many">
  extends Data.TaggedClass("project")<{
    current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues, TType>
    schema: S.Schema<A, TFieldValues, R>
    mode: "collect" | "project" | "transform"
  }>
  implements QueryProjection<TFieldValues, A, R>
{
  readonly [QId]!: any
  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export const make: <TFieldValues extends FieldValues>() => Query<TFieldValues> = () => new Initial()

export const where: FilterWhere = (...operation: any[]) => (current: any) =>
  new Where({ current, operation: typeof operation[0] === "function" ? flow(...operation as [any]) : operation } as any)

export const and: FilterContinuationAnd = (...operation: any[]) => (current: any) =>
  new And({ current, operation: typeof operation[0] === "function" ? flow(...operation as [any]) : operation } as any)

export const or: FilterContinuationOr = (...operation: any[]) => (current: any) =>
  new Or({ current, operation: typeof operation[0] === "function" ? flow(...operation as [any]) : operation } as any)

export const order: {
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "many", any>
  >(
    field: FieldPath<ExtractFieldValuesRefined<Q>>,
    direction?: "ASC" | "DESC"
  ): (
    current: Q
  ) => QueryEnd<ExtractFieldValuesRefined<Q>, "many", ExtractExclusiveness<Q>>
} = (field, direction = "ASC") => (current) => new Order({ current, field: field as any, direction })

export const page: {
  (
    page: { skip?: number; take?: number }
  ): <Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "many", any>>(
    current: Q
  ) => QueryEnd<ExtractFieldValuesRefined<Q>, "many", ExtractExclusiveness<Q>>
} = ({ skip, take }) => (current) =>
  new Page({
    current,
    take,
    skip
  })

export const one: {
  <Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "many", any>>(
    current: Q
  ): QueryEnd<ExtractFieldValuesRefined<Q>, "one", ExtractExclusiveness<Q>>
} = (current) =>
  new One({
    current
  })

// it's better to implement a distinct count so that the implementation can be optimised per adapter
export const count: {
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "many", any>
  >(
    current: Q
  ): QueryProjection<ExtractFieldValuesRefined<Q>, NonNegativeInt, never, "count", ExtractExclusiveness<Q>>
} = (current) => new Count({ current })

export const project: {
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Schema<
      Option<A>,
      {
        [K in keyof I]: K extends keyof ExtractFieldValuesRefined<Q> ? I[K] : never
      },
      R
    >,
    mode: "collect"
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>

  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Schema<
      A,
      {
        [K in keyof I]: K extends keyof ExtractFieldValuesRefined<Q> ? I[K] : never
      },
      R
    >,
    mode: "project"
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Schema<
      A,
      {
        [K in keyof I]: K extends keyof ExtractFieldValuesRefined<Q> ? I[K] : never
      },
      R
    >
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>
} = (schema: any, mode = "transform") => (current: any) => new Project({ current, schema, mode } as any)

type GetArV<T> = T extends readonly (infer R)[] ? R : never

export type FilterContinuations<IsCurrentInitial extends boolean = false> = {
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>

  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op: "gt" | "gte" | "lt" | "lte" | "neq",
    value: V // only numbers?
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op: "startsWith" | "endsWith" | "contains" | "notContains" | "notStartsWith" | "notEndsWith",
    value: FieldPathValue<TFieldValues, TFieldName> extends string ? string : never
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    const V extends readonly FieldPathValue<TFieldValues, TFieldName>[],
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op: "in",
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<
    TFieldValues,
    // @ts-expect-error it's TS
    RefineWithLiteral<TFieldValuesRefined, TFieldName, NonNullable<V[number]>>,
    E
  >
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op: "notIn",
    value: readonly V[]
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op:
      | "includes"
      | "notIncludes",
    value: GetArV<V>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op:
      | "includes-any"
      | "notIncludes-any"
      | "includes-all"
      | "notIncludes-all",
    value: readonly GetArV<V>[]
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(f: {
    path: TFieldName
    op: Ops
    value: V
  }): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
}

/* dprint-ignore-start */
export type RefineWithLiteral<
  TFieldValues extends FieldValues,
  TFieldName extends FieldPath<TFieldValues>,
  V,
  Exclde extends boolean = false
> =
  // refine only if the value is a primitive
  [V] extends [string | number | boolean | null | bigint]
    ? RefineFieldPathValue<TFieldValues, TFieldName, V, Exclde>
    : TFieldValues
/* dprint-ignore-end */

export type FilteringRefinements<IsCurrentInitial extends boolean = false> = {
  <
    TFieldValues extends FieldValues,
    const TFieldName extends FieldPath<TFieldValues>,
    const V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<
      TFieldValues,
      // @ts-expect-error it's TS
      RefineWithLiteral<TFieldValuesRefined, TFieldName, V>,
      TFieldName extends "_tag" ? true : false // consider only _tag as an exclusive field and only in the positive case
    >
  <
    TFieldValues extends FieldValues,
    const TFieldName extends FieldPath<TFieldValues>,
    const V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false
  >(
    path: TFieldName,
    op: "neq",
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<
      TFieldValues,
      // @ts-expect-error it's TS
      RefineWithLiteral<TFieldValuesRefined, TFieldName, V, true>,
      E
    >
}

export type NestedQueriesFixedRefinement<IsCurrentInitial extends boolean = false> = {
  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E8>) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E8>) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E10>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E10>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E8>) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E11>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E11>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E8>) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E12>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E12>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false,
    E13 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E8>) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E12>,
    fm: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E12>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E13>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E13>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false,
    E13 extends boolean = false,
    E14 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined, E2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E2>) => QueryWhere<TFieldValues, TFieldValuesRefined, E3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E3>) => QueryWhere<TFieldValues, TFieldValuesRefined, E4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E4>) => QueryWhere<TFieldValues, TFieldValuesRefined, E5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E5>) => QueryWhere<TFieldValues, TFieldValuesRefined, E6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E6>) => QueryWhere<TFieldValues, TFieldValuesRefined, E7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E7>) => QueryWhere<TFieldValues, TFieldValuesRefined, E8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined, E8>) => QueryWhere<TFieldValues, TFieldValuesRefined, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E12>,
    fm: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E12>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E13>,
    fn: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined, E13>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined, E14>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined, E14>
}

export type NestedQueriesFreeIntersectionRefinement = {
  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined2, E2>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined3, E3>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined4, E4>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined5, E5>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined6, E6>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined7, E7>
  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined8, E8>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined9, E9>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined10, E10>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined11, E11>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    TFieldValuesRefined12 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined12, E12>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined12, E12>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    TFieldValuesRefined12 extends TFieldValues = TFieldValues,
    TFieldValuesRefined13 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false,
    E13 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined12, E12>,
    fm: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined12, E12>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined13, E13>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined13, E13>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    TFieldValuesRefined12 extends TFieldValues = TFieldValues,
    TFieldValuesRefined13 extends TFieldValues = TFieldValues,
    TFieldValuesRefined14 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false,
    E13 extends boolean = false,
    E14 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined12, E12>,
    fm: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined12, E12>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined13, E13>,
    fn: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined13, E13>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined14, E14>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined & TFieldValuesRefined14, E14>
}

// to be safe, or forces the output to be exclusive because you can always or _tag filters
export type NestedQueriesFreeDisjointRefinement = {
  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined2, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined3, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined4, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined5, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined6, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined7, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined2, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined9, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined10, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined11, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    TFieldValuesRefined12 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined12, E12>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined12, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    TFieldValuesRefined12 extends TFieldValues = TFieldValues,
    TFieldValuesRefined13 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false,
    E13 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined12, E12>,
    fm: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined12, E12>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined13, E13>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined13, false>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues,
    TFieldValuesRefined9 extends TFieldValues = TFieldValues,
    TFieldValuesRefined10 extends TFieldValues = TFieldValues,
    TFieldValuesRefined11 extends TFieldValues = TFieldValues,
    TFieldValuesRefined12 extends TFieldValues = TFieldValues,
    TFieldValuesRefined13 extends TFieldValues = TFieldValues,
    TFieldValuesRefined14 extends TFieldValues = TFieldValues,
    E extends boolean = false,
    E2 extends boolean = false,
    E3 extends boolean = false,
    E4 extends boolean = false,
    E5 extends boolean = false,
    E6 extends boolean = false,
    E7 extends boolean = false,
    E8 extends boolean = false,
    E9 extends boolean = false,
    E10 extends boolean = false,
    E11 extends boolean = false,
    E12 extends boolean = false,
    E13 extends boolean = false,
    E14 extends boolean = false
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2, E2>,
    fc: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined2, E2>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined3, E3>,
    fd: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined3, E3>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined4, E4>,
    fe: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined4, E4>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined5, E5>,
    ff: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined5, E5>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined6, E6>,
    fg: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined6, E6>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined7, E7>,
    fh: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined7, E7>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined8, E8>,
    fi: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined8, E8>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined9, E9>,
    fj: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined9, E9>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined10, E10>,
    fk: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined10, E10>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined11, E11>,
    fl: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined11, E11>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined12, E12>,
    fm: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined12, E12>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined13, E13>,
    fn: (
      query: QueryWhere<TFieldValues, TFieldValuesRefined13, E13>
    ) => QueryWhere<TFieldValues, TFieldValuesRefined14, E14>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined14, false>
}

export type FilterWhere =
  & NestedQueriesFixedRefinement<true>
  & FilteringRefinements<true>
  & FilterContinuations<true>

export type FilterContinuationAnd =
  & NestedQueriesFreeIntersectionRefinement
  & FilteringRefinements
  & FilterContinuations

export type FilterContinuationOr =
  & NestedQueriesFreeDisjointRefinement
  & FilterContinuations
