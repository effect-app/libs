/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Data from "effect/Data"
import { flow } from "effect/Function"
import * as Pipeable from "effect/Pipeable"
import type { Covariant } from "effect/Types"
import type * as Option from "../../Option.js"
import type * as S from "../../Schema.js"
import type { NonNegativeInt } from "../../Schema.js"
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
export type Query<TFieldValues extends FieldValues> = QueryTogether<TFieldValues, TFieldValues>
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

export type ComputedProjectionOperation = (q: Query<any>) => QueryWhere<any, any, any>

export type ComputedProjectionMathExpression =
  | {
    readonly _tag: "field"
    readonly field: string
  }
  | {
    readonly _tag: "mul"
    readonly left: ComputedProjectionMathExpression
    readonly right: ComputedProjectionMathExpression
  }

export type ComputedProjectionExpression =
  | {
    readonly _tag: "relation-count"
    readonly path: string
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-any"
    readonly path: string
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-every"
    readonly path: string
    readonly operation: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-distinct-count"
    readonly path: string
    readonly field: string
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-sum"
    readonly path: string
    readonly field: string
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-sum-expr"
    readonly path: string
    readonly expression: ComputedProjectionMathExpression
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-sum-expr-by"
    readonly path: string
    readonly expression: ComputedProjectionMathExpression
    readonly unit: string
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-sum-expr-normalized"
    readonly path: string
    readonly expression: ComputedProjectionMathExpression
    readonly unit: string
    readonly toBase: string
    readonly factors: Readonly<Record<string, number>>
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-collect"
    readonly path: string
    readonly field: string
    readonly distinct: boolean
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-collect-fields"
    readonly path: string
    readonly fields: readonly string[]
    readonly distinct: boolean
    readonly operation?: ComputedProjectionOperation
  }
  | {
    readonly _tag: "relation-length"
    readonly path: string
  }

/**
 * An expression that aggregates values across documents (for use with {@link aggregate}).
 * `agg-field` references a document field to group by; other tags are aggregate functions.
 */
export type AggregateExpression =
  | {
    readonly _tag: "agg-field"
    readonly path: string
  }
  | {
    readonly _tag: "agg-count"
  }
  | {
    readonly _tag: "agg-count-when"
    readonly operation: ComputedProjectionOperation
  }
  | {
    readonly _tag: "agg-sum"
    readonly field: string
  }
  | {
    readonly _tag: "agg-min"
    readonly field: string
  }
  | {
    readonly _tag: "agg-max"
    readonly field: string
  }

export type AggregateMap = Readonly<Record<string, AggregateExpression>>

export type ComputedProjectionMap = Readonly<Record<string, ComputedProjectionExpression>>
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
  override pipe() {
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

  override pipe() {
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
  override pipe() {
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
  override pipe() {
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
  override pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class One<TFieldValues extends FieldValues> extends Data.TaggedClass("one")<{
  current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues>
}> implements QueryEnd<TFieldValues, "one"> {
  readonly [QId]!: any
  override pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Count<TFieldValues extends FieldValues> extends Data.TaggedClass("count")<{
  current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues>
}> implements QueryEnd<TFieldValues, "count"> {
  readonly [QId]!: any
  override pipe() {
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
  override pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments)
  }
}

export class Project<A, TFieldValues extends FieldValues, R, TType extends "one" | "many" = "many">
  extends Data.TaggedClass("project")<{
    current: Query<TFieldValues> | QueryWhere<any, TFieldValues> | QueryEnd<TFieldValues, TType>
    schema: S.Codec<A, TFieldValues, R>
    mode: "collect" | "project" | "transform" | "aggregate"
    computed?: ComputedProjectionMap
    aggregateMap?: AggregateMap
  }>
  implements QueryProjection<TFieldValues, A, R>
{
  readonly [QId]!: any
  override pipe() {
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

export const whereEvery: WhereEveryOrSome =
  ((subPath: string, ...[first, ...rest]: any[]) => (current: any) =>
    new Where(
      {
        current,
        operation: typeof first === "function"
          ? flow(...[first, ...rest] as [any])
          : [`${subPath}.-1.${first}`, ...rest],
        relation: "every",
        subPath
      } as any
    )) as unknown as WhereEveryOrSome
export const whereSome: WhereEveryOrSome =
  ((subPath: string, ...[first, ...rest]: any[]) => (current: any) =>
    new Where(
      {
        current,
        operation: typeof first === "function"
          ? flow(...[first, ...rest] as [any])
          : [`${subPath}.-1.${first}`, ...rest],
        relation: "some",
        subPath
      } as any
    )) as unknown as WhereEveryOrSome

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

/**
 * Attach a projection schema to a query.
 *
 * The `select` clause sent to the store is derived from the schema's encoded
 * AST property names (top-level + per-array sub-keys), so a projection always
 * narrows what is read from the store. The repository augments that select
 * with `id` and `_etag` for change tracking. See {@link toFilter} and the
 * dispatch in `Repository/internal/internal.ts`.
 *
 * Modes — pick based on shape of the decoded value and on whether the
 * persistence-model (PM) reverse-mapping is needed:
 *
 * - `"transform"` (default when `mode` omitted): goes through the repo's
 *   `parseMany` pipeline. The raw row is reverse-mapped via the
 *   etag/PM cache (re-injecting `_etag` and any PM-shape state) before
 *   decoding. Decode failures `orDie` (error channel = `never`). Use when
 *   the schema operates on the full PM shape (e.g. full-entity reads that
 *   must preserve etag tracking).
 *
 * - `"project"`: decodes the raw encoded row directly with the supplied
 *   schema. No PM reverse-mapping, no etag cache merge. Decode failures
 *   surface as `S.SchemaError`. Use for slim DTOs / aggregations that do not
 *   need etag tracking and whose schema input is a plain subset of `Encoded`.
 *
 * - `"collect"`: like `"project"`, but the schema yields `Option<A>` and
 *   `None` values are dropped post-decode (`Array.getSomes`). Use to filter
 *   rows during decode (e.g. discriminated-union narrowing where some rows
 *   should not appear in the result).
 */
export const project: {
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Codec<
      Option.Option<A>,
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
    schema: S.Codec<
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
    schema: S.Codec<
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

/**
 * Element type of an array-valued field path on `TFieldValues`. Falls back to
 * `FieldValues` when the path does not resolve to an array of structs so that
 * `FieldPath<...>` stays defined (it just degrades to `string`).
 *
 * Uses `Extract` so that when `P` defaults to the full `FieldPath<TFieldValues>`
 * union, only the array-valued branches contribute to the element type.
 */
export type RelationElement<
  TFieldValues extends FieldValues,
  P extends FieldPath<TFieldValues>
> = Extract<FieldPathValue<TFieldValues, P>, ReadonlyArray<unknown>> extends ReadonlyArray<infer E>
  ? (E extends FieldValues ? E : FieldValues)
  : FieldValues

export const relation = <
  TFieldValues extends FieldValues,
  const P extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>(
  path: P
) => ({
  /**
   * Typed math-expression builder bound to the relation's element scope:
   * `relation("items").expr.field("weight")` constrains the field path to
   * `FieldPath<RelationElement<TFieldValues, P>>`.
   */
  expr: {
    field: (field: FieldPath<RelationElement<TFieldValues, P>>): ComputedProjectionMathExpression => ({
      _tag: "field",
      field: field as string
    }),
    mul: (
      left: ComputedProjectionMathExpression,
      right: ComputedProjectionMathExpression
    ): ComputedProjectionMathExpression => ({ _tag: "mul", left, right })
  },
  length: (): ComputedProjectionExpression => ({
    _tag: "relation-length",
    path: path as string
  }),
  count: (operation?: ComputedProjectionOperation): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-count",
        path: path as string,
        operation
      }
      : {
        _tag: "relation-count",
        path: path as string
      },
  any: (operation?: ComputedProjectionOperation): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-any",
        path: path as string,
        operation
      }
      : {
        _tag: "relation-any",
        path: path as string
      },
  every: (operation: ComputedProjectionOperation): ComputedProjectionExpression => ({
    _tag: "relation-every",
    path: path as string,
    operation
  }),
  distinctCount: (
    field: FieldPath<RelationElement<TFieldValues, P>>,
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-distinct-count",
        path: path as string,
        field: field as string,
        operation
      }
      : {
        _tag: "relation-distinct-count",
        path: path as string,
        field: field as string
      },
  sum: (
    field: FieldPath<RelationElement<TFieldValues, P>>,
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-sum",
        path: path as string,
        field: field as string,
        operation
      }
      : {
        _tag: "relation-sum",
        path: path as string,
        field: field as string
      },
  sumExpr: (
    expression: ComputedProjectionMathExpression,
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-sum-expr",
        path: path as string,
        expression,
        operation
      }
      : {
        _tag: "relation-sum-expr",
        path: path as string,
        expression
      },
  sumExprBy: (
    expression: ComputedProjectionMathExpression,
    options: { unit: FieldPath<RelationElement<TFieldValues, P>> },
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-sum-expr-by",
        path: path as string,
        expression,
        unit: options.unit as string,
        operation
      }
      : {
        _tag: "relation-sum-expr-by",
        path: path as string,
        expression,
        unit: options.unit as string
      },
  sumExprNormalized: (
    expression: ComputedProjectionMathExpression,
    options: {
      unit: FieldPath<RelationElement<TFieldValues, P>>
      toBase: string
      factors: Readonly<Record<string, number>>
    },
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-sum-expr-normalized",
        path: path as string,
        expression,
        unit: options.unit as string,
        toBase: options.toBase,
        factors: options.factors,
        operation
      }
      : {
        _tag: "relation-sum-expr-normalized",
        path: path as string,
        expression,
        unit: options.unit as string,
        toBase: options.toBase,
        factors: options.factors
      },
  collect: (
    field: FieldPath<RelationElement<TFieldValues, P>>,
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-collect",
        path: path as string,
        field: field as string,
        distinct: false,
        operation
      }
      : {
        _tag: "relation-collect",
        path: path as string,
        field: field as string,
        distinct: false
      },
  collectDistinct: (
    field: FieldPath<RelationElement<TFieldValues, P>>,
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-collect",
        path: path as string,
        field: field as string,
        distinct: true,
        operation
      }
      : {
        _tag: "relation-collect",
        path: path as string,
        field: field as string,
        distinct: true
      },
  collectFields: (
    fields: readonly FieldPath<RelationElement<TFieldValues, P>>[],
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-collect-fields",
        path: path as string,
        fields: fields as readonly string[],
        distinct: false,
        operation
      }
      : {
        _tag: "relation-collect-fields",
        path: path as string,
        fields: fields as readonly string[],
        distinct: false
      },
  collectDistinctFields: (
    fields: readonly FieldPath<RelationElement<TFieldValues, P>>[],
    operation?: ComputedProjectionOperation
  ): ComputedProjectionExpression =>
    operation
      ? {
        _tag: "relation-collect-fields",
        path: path as string,
        fields: fields as readonly string[],
        distinct: true,
        operation
      }
      : {
        _tag: "relation-collect-fields",
        path: path as string,
        fields: fields as readonly string[],
        distinct: true
      }
})

/**
 * Untyped math-expression builder. Field paths are not statically validated —
 * prefer the scope-bound `relation(path).expr` builder when the element type
 * is known, since it constrains the field argument to `FieldPath<E>`.
 *
 * The generic parameter is accepted for symmetry with the scoped builder so
 * callers may opt into a tighter check via `expr.field<E>("x")`.
 */
export const expr = {
  field: <T extends FieldValues = FieldValues>(
    field: FieldPath<T>
  ): ComputedProjectionMathExpression => ({ _tag: "field", field: field as string }),
  mul: (
    left: ComputedProjectionMathExpression,
    right: ComputedProjectionMathExpression
  ): ComputedProjectionMathExpression => ({ _tag: "mul", left, right })
} as const

export const computed = <T extends ComputedProjectionMap>(value: T): T => value

export const projectComputed: {
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I extends Record<string, unknown>,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Codec<Option.Option<A>, I, R>,
    computedProjection: ComputedProjectionMap,
    mode: "collect"
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>

  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I extends Record<string, unknown>,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Codec<A, I, R>,
    computedProjection: ComputedProjectionMap,
    mode?: "project"
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>
} = (schema: any, computedProjection: ComputedProjectionMap, mode = "project") => (current: any) =>
  new Project({ current, schema, mode, computed: computedProjection } as any)

/**
 * Builder shape returned by {@link agg}. Field-taking methods are constrained
 * to `FieldPath<TFieldValues>` so paths are validated against the document
 * shape.
 */
export interface AggBuilder<TFieldValues extends FieldValues> {
  field: (path: FieldPath<TFieldValues>) => AggregateExpression
  count: () => AggregateExpression
  countWhen: (operation: ComputedProjectionOperation) => AggregateExpression
  sum: (field: FieldPath<TFieldValues>) => AggregateExpression
  min: (field: FieldPath<TFieldValues>) => AggregateExpression
  max: (field: FieldPath<TFieldValues>) => AggregateExpression
}

const makeAggBuilder = <TFieldValues extends FieldValues>(): AggBuilder<TFieldValues> => ({
  field: (path) => ({ _tag: "agg-field", path: path as string }),
  count: () => ({ _tag: "agg-count" }),
  countWhen: (operation) => ({ _tag: "agg-count-when", operation }),
  sum: (field) => ({ _tag: "agg-sum", field: field as string }),
  min: (field) => ({ _tag: "agg-min", field: field as string }),
  max: (field) => ({ _tag: "agg-max", field: field as string })
})

/**
 * Scope-bound aggregate-expression builder factory. Invoke with the source
 * document field-value shape to get a builder whose `field`/`sum`/`min`/`max`
 * arguments are constrained to `FieldPath<TFieldValues>`.
 *
 * Prefer the inline callback form of {@link aggregate} (`aggregate(schema,
 * ($) => ({...}))`) — there the source shape is inferred from the pipe so no
 * explicit type argument is needed. This factory is the escape hatch when
 * the builder is constructed outside the pipe.
 */
export const agg = <TFieldValues extends FieldValues = FieldValues>(): AggBuilder<TFieldValues> =>
  makeAggBuilder<TFieldValues>()

/**
 * Attach an aggregate projection to a query, performing GROUP BY + aggregate functions at the
 * database level instead of fetching all rows and grouping in memory.
 *
 * Pass a builder callback to get a typed `agg` bound to the source row shape
 * (inferred from the pipe — no explicit generic needed):
 *
 * @example
 * ```ts
 * repo.query(
 *   where("status", "active"),
 *   aggregate(
 *     S.Struct({ city: S.String, count: S.Number }),
 *     ($) => ({
 *       city: $.field("address.city"),
 *       count: $.countWhen((q) => q.pipe(where("active", true)))
 *     })
 *   )
 * )
 * ```
 *
 * A plain {@link AggregateMap} is also accepted for the rare case where the
 * map is built outside the pipe (loses path inference).
 *
 * The output is decoded directly with `schema` (no PM reverse-mapping, no etag tracking).
 * Decode failures surface as `S.SchemaError`.
 */
export const aggregate: {
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I extends Record<string, unknown>,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Codec<A, I, R>,
    build: (agg: AggBuilder<ExtractFieldValuesRefined<Q>>) => AggregateMap
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>
  <
    Q extends Query<any> | QueryWhere<any, any, any> | QueryEnd<any, "one" | "many", any>,
    I extends Record<string, unknown>,
    A = ExtractFieldValuesRefined<Q>,
    R = never,
    E extends boolean = ExtractExclusiveness<Q>
  >(
    schema: S.Codec<A, I, R>,
    aggregateMap: AggregateMap
  ): (
    current: Q
  ) => QueryProjection<ExtractFieldValuesRefined<Q>, A, R, ExtractTType<Q>, E>
} = (schema: any, mapOrBuild: AggregateMap | ((agg: AggBuilder<FieldValues>) => AggregateMap)) => (current: any) => {
  const aggregateMap = typeof mapOrBuild === "function"
    ? mapOrBuild(makeAggBuilder())
    : mapOrBuild
  return new Project({ current, schema, mode: "aggregate", aggregateMap } as any)
}

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
    op: "in" | "notIn",
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
    op: "eq"
    value: V
  }): (
    current: IsCurrentInitial extends true ? Query<TFieldValues>
      : QueryWhere<TFieldValues, TFieldValuesRefined, E>
  ) => IsCurrentInitial extends true ? QueryWhere<TFieldValues>
    : QueryWhere<TFieldValues, TFieldValuesRefined, E>
}

export type FilterContinuationsWithSubpath = {
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>,
    V extends FieldPathValue<TFieldValuesSub, TFieldNameSub>
  >(
    subPath: TFieldName,
    restPath: TFieldNameSub,
    value: V
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>,
    V extends FieldPathValue<TFieldValuesSub, TFieldNameSub>
  >(
    subPath: TFieldName,
    restPath: TFieldNameSub,
    op: "gt" | "gte" | "lt" | "lte" | "neq",
    value: V // only numbers?
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>
  >(
    subPath: TFieldName,
    restPath: TFieldNameSub,
    op: "startsWith" | "endsWith" | "contains" | "notContains" | "notStartsWith" | "notEndsWith",
    value: FieldPathValue<TFieldValuesSub, TFieldNameSub> extends string ? string : never
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>,
    const V extends readonly FieldPathValue<TFieldValuesSub, TFieldNameSub>[]
  >(
    subPath: TFieldName,
    restPath: TFieldNameSub,
    op: "in" | "notIn",
    value: V
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>,
    V extends FieldPathValue<TFieldValuesSub, TFieldNameSub>
  >(
    subPath: TFieldName,
    restPath: TFieldNameSub,
    op:
      | "includes"
      | "notIncludes",
    value: GetArV<V>
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>,
    V extends FieldPathValue<TFieldValuesSub, TFieldNameSub>
  >(
    subPath: TFieldName,
    restPath: TFieldNameSub,
    op:
      | "includes-any"
      | "notIncludes-any"
      | "includes-all"
      | "notIncludes-all",
    value: readonly GetArV<V>[]
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>,
    TFieldValuesSub extends TFieldValues[TFieldName][number],
    TFieldNameSub extends FieldPath<TFieldValuesSub>,
    V extends FieldPathValue<TFieldValuesSub, TFieldNameSub>
  >(f: {
    subPath: TFieldName
    restPath: TFieldNameSub
    op: "eq"
    value: V
  }): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues>
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
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined2>

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
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined3>

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
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined4>

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
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined5>

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
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined6>

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
  ) => QueryWhere<TFieldValues, TFieldValuesRefined | TFieldValuesRefined14>
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

// it does not support refinements by choice (for now)
export type WhereEveryOrSome =
  & {
    <
      TFieldValues extends FieldValues,
      TFieldName extends FieldPath<TFieldValues>
    >(
      subPath: TFieldName,
      dude: (
        current: Query<TFieldValues[TFieldName][number]>
      ) => QueryWhere<TFieldValues[TFieldName][number], TFieldValues[TFieldName][number]>,
      ...dudes: ((
        current: QueryWhere<TFieldValues[TFieldName][number], TFieldValues[TFieldName][number]>
      ) => QueryWhere<TFieldValues[TFieldName][number], TFieldValues[TFieldName][number]>)[]
    ): (
      current: Query<TFieldValues>
    ) => QueryWhere<TFieldValues, TFieldValues>
  }
  & FilterContinuationsWithSubpath
