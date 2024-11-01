/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Option, S } from "effect-app"
import { Data, flow, Pipeable } from "effect-app"
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
  TType extends "one" | "many" = "many"
> =
  | Query<TFieldValues>
  | QueryWhere<TFieldValues, TFieldValuesRefined>
  | QueryEnd<TFieldValues, TType>
  | QueryProjection<TFieldValues, A, R>

export const QId = Symbol()
export type QId = typeof QId

export interface QueryTogether<
  out TFieldValues extends FieldValues,
  out TFieldValuesRefined extends TFieldValues = TFieldValues,
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
  }
}

type ExtractTType<T> = T extends QueryTogether<any, any, any, any, any, infer TType> ? TType : never
// type ExtractFieldValues<T> = T extends QueryTogether<infer TFieldValues, any, any, any, any, any> ? TFieldValues : never
type ExtractFieldValuesRefined<T> = T extends QueryTogether<any, infer TFieldValuesRefined, any, any, any, any>
  ? TFieldValuesRefined
  : never

export type Query<TFieldValues extends FieldValues> = QueryTogether<TFieldValues, TFieldValues, "initial">
export type QueryWhere<TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues> =
  QueryTogether<
    TFieldValues,
    TFieldValuesRefined,
    "where"
  >

export type QueryEnd<TFieldValues extends FieldValues, TType extends "many" | "one" | "count" = "many"> = QueryTogether<
  TFieldValues,
  TFieldValues,
  "end",
  TFieldValues,
  never,
  TType
>

export type QueryProjection<
  TFieldValues extends FieldValues,
  A = TFieldValues,
  R = never,
  TType extends "many" | "one" | "count" = "many"
> = QueryTogether<
  TFieldValues,
  TFieldValues,
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
    Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any>
  >(
    field: FieldPath<ExtractFieldValuesRefined<Q>>,
    direction?: "ASC" | "DESC"
  ): (
    current: Q
  ) => QueryEnd<ExtractFieldValuesRefined<Q>>
} = (field, direction = "ASC") => (current) => new Order({ current, field: field as any, direction })

export const page: {
  (
    page: { skip?: number; take?: number }
  ): <Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any>>(
    current: Q
  ) => QueryEnd<ExtractFieldValuesRefined<Q>>
} = ({ skip, take }) => (current) =>
  new Page({
    current,
    take,
    skip
  })

export const one: {
  <Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any>>(
    current: Q
  ): QueryEnd<ExtractFieldValuesRefined<Q>, "one">
} = (current) =>
  new One({
    current
  })

// it's better to implement a distinct count so that the implementation can be optimised per adapter
export const count: {
  <
    Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any>
  >(
    current: Q
  ): QueryProjection<ExtractFieldValuesRefined<Q>, NonNegativeInt, never, "count">
} = (current) => new Count({ current })

export const project: {
  <
    Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any, "one" | "many">,
    I extends Partial<ExtractFieldValuesRefined<Q>> = ExtractFieldValuesRefined<Q>,
    A = ExtractFieldValuesRefined<Q>,
    R = never
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
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>>

  <
    Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any, "one" | "many">,
    I extends Partial<ExtractFieldValuesRefined<Q>> = ExtractFieldValuesRefined<Q>,
    A = ExtractFieldValuesRefined<Q>,
    R = never
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
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>>
  <
    Q extends Query<any> | QueryWhere<any, any> | QueryEnd<any, "one" | "many">,
    I extends Partial<ExtractFieldValuesRefined<Q>> = ExtractFieldValuesRefined<Q>,
    A = ExtractFieldValuesRefined<Q>,
    R = never
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
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>>
} = (schema: any, mode = "transform") => (current: any) => new Project({ current, schema, mode } as any)

type GetArV<T> = T extends readonly (infer R)[] ? R : never

export type FilterContinuations<IsCurrentInitial extends boolean = false> = {
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>

  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    op: "gt" | "gte" | "lt" | "lte" | "neq",
    value: V // only numbers?
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends string,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    op: "startsWith" | "endsWith" | "contains" | "notContains" | "notStartsWith" | "notEndsWith",
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    op:
      | "in"
      | "notIn",
    value: readonly V[]
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    op:
      | "includes"
      | "notIncludes",
    value: GetArV<V>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
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
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(f: {
    path: TFieldName
    op: Ops
    value: V
  }): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined>
}

/* dprint-ignore-start */
export type RefineWithLiteral<
  TFieldValues extends FieldValues,
  TFieldName extends FieldPath<TFieldValues>,
  V,
  Exclde extends boolean = false
> =
// refine only if the value is a literal
  V extends string | number | boolean | null | bigint
    ? RefineFieldPathValue<TFieldValues, TFieldName, V, Exclde>
    : TFieldValues
/* dprint-ignore-end */

export type FilteringRefinements<IsCurrentInitial extends boolean = false> = {
  <
    TFieldValues extends FieldValues,
    const TFieldName extends FieldPath<TFieldValues>,
    const V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<
      TFieldValues,
      // @ts-expect-error it's TS
      RefineWithLiteral<TFieldValues, TFieldName, V>
    >
    : QueryWhere<
      TFieldValues,
      // @ts-expect-error it's TS
      RefineWithLiteral<TFieldValuesRefined, TFieldName, V>
    >
  <
    TFieldValues extends FieldValues,
    const TFieldName extends FieldPath<TFieldValues>,
    const V extends FieldPathValue<TFieldValues, TFieldName>,
    TFieldValuesRefined extends TFieldValues = TFieldValues
  >(
    path: TFieldName,
    op: "neq",
    value: V
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => IsCurrentInitial extends true ? QueryWhere<
      TFieldValues,
      // @ts-expect-error it's TS
      RefineWithLiteral<TFieldValues, TFieldName, V, true>
    >
    : QueryWhere<
      TFieldValues,
      // @ts-expect-error it's TS
      RefineWithLiteral<TFieldValuesRefined, TFieldName, V, true>
    >
}

export type NestedQueriesFixedRefinement<IsCurrentInitial extends boolean = false> = {
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>

  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>

  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>

  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>

  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fl: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fl: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fm: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
  <TFieldValues extends FieldValues, TFieldValuesRefined extends TFieldValues = TFieldValues>(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fl: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fm: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>,
    fn: (query: QueryWhere<TFieldValues, TFieldValuesRefined>) => QueryWhere<TFieldValues, TFieldValuesRefined>
  ): (
    current: IsCurrentInitial extends true ? Query<TFieldValues> : QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined>
}

export type NestedQueriesFreeDisjointRefinement = {
  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined2>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined3>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined4>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined5>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined6>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined7>

  <
    TFieldValues extends FieldValues,
    TFieldValuesRefined extends TFieldValues = TFieldValues,
    TFieldValuesRefined2 extends TFieldValues = TFieldValues,
    TFieldValuesRefined3 extends TFieldValues = TFieldValues,
    TFieldValuesRefined4 extends TFieldValues = TFieldValues,
    TFieldValuesRefined5 extends TFieldValues = TFieldValues,
    TFieldValuesRefined6 extends TFieldValues = TFieldValues,
    TFieldValuesRefined7 extends TFieldValues = TFieldValues,
    TFieldValuesRefined8 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined2>

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
    TFieldValuesRefined9 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined8>) => QueryWhere<TFieldValues, TFieldValuesRefined9>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined9>

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
    TFieldValuesRefined10 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined8>) => QueryWhere<TFieldValues, TFieldValuesRefined9>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined9>) => QueryWhere<TFieldValues, TFieldValuesRefined10>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined10>

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
    TFieldValuesRefined11 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined8>) => QueryWhere<TFieldValues, TFieldValuesRefined9>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined9>) => QueryWhere<TFieldValues, TFieldValuesRefined10>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined10>) => QueryWhere<TFieldValues, TFieldValuesRefined11>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined11>

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
    TFieldValuesRefined12 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined8>) => QueryWhere<TFieldValues, TFieldValuesRefined9>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined9>) => QueryWhere<TFieldValues, TFieldValuesRefined10>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined10>) => QueryWhere<TFieldValues, TFieldValuesRefined11>,
    fl: (query: QueryWhere<TFieldValues, TFieldValuesRefined11>) => QueryWhere<TFieldValues, TFieldValuesRefined12>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined12>

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
    TFieldValuesRefined13 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined8>) => QueryWhere<TFieldValues, TFieldValuesRefined9>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined9>) => QueryWhere<TFieldValues, TFieldValuesRefined10>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined10>) => QueryWhere<TFieldValues, TFieldValuesRefined11>,
    fl: (query: QueryWhere<TFieldValues, TFieldValuesRefined11>) => QueryWhere<TFieldValues, TFieldValuesRefined12>,
    fm: (query: QueryWhere<TFieldValues, TFieldValuesRefined12>) => QueryWhere<TFieldValues, TFieldValuesRefined13>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined13>

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
    TFieldValuesRefined14 extends TFieldValues = TFieldValues
  >(
    fb: (current: Query<TFieldValues>) => QueryWhere<TFieldValues, TFieldValuesRefined2>,
    fc: (query: QueryWhere<TFieldValues, TFieldValuesRefined2>) => QueryWhere<TFieldValues, TFieldValuesRefined3>,
    fd: (query: QueryWhere<TFieldValues, TFieldValuesRefined3>) => QueryWhere<TFieldValues, TFieldValuesRefined4>,
    fe: (query: QueryWhere<TFieldValues, TFieldValuesRefined4>) => QueryWhere<TFieldValues, TFieldValuesRefined5>,
    ff: (query: QueryWhere<TFieldValues, TFieldValuesRefined5>) => QueryWhere<TFieldValues, TFieldValuesRefined6>,
    fg: (query: QueryWhere<TFieldValues, TFieldValuesRefined6>) => QueryWhere<TFieldValues, TFieldValuesRefined7>,
    fh: (query: QueryWhere<TFieldValues, TFieldValuesRefined7>) => QueryWhere<TFieldValues, TFieldValuesRefined8>,
    fi: (query: QueryWhere<TFieldValues, TFieldValuesRefined8>) => QueryWhere<TFieldValues, TFieldValuesRefined9>,
    fj: (query: QueryWhere<TFieldValues, TFieldValuesRefined9>) => QueryWhere<TFieldValues, TFieldValuesRefined10>,
    fk: (query: QueryWhere<TFieldValues, TFieldValuesRefined10>) => QueryWhere<TFieldValues, TFieldValuesRefined11>,
    fl: (query: QueryWhere<TFieldValues, TFieldValuesRefined11>) => QueryWhere<TFieldValues, TFieldValuesRefined12>,
    fm: (query: QueryWhere<TFieldValues, TFieldValuesRefined12>) => QueryWhere<TFieldValues, TFieldValuesRefined13>,
    fn: (query: QueryWhere<TFieldValues, TFieldValuesRefined13>) => QueryWhere<TFieldValues, TFieldValuesRefined14>
  ): (
    current: QueryWhere<TFieldValues, TFieldValuesRefined>
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined14>
}

export type FilterWhere =
  & NestedQueriesFixedRefinement<true>
  & FilteringRefinements<true>
  & FilterContinuations<true>

export type FilterContinuationAnd =
  & NestedQueriesFixedRefinement
  & FilteringRefinements
  & FilterContinuations

export type FilterContinuationOr =
  & NestedQueriesFreeDisjointRefinement
  & FilterContinuations
