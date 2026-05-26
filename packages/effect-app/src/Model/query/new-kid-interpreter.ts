/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { identity, pipe } from "effect/Function"
import * as Match from "effect/Match"
import * as SchemaAST from "effect/SchemaAST"
import * as Array from "../../Array.js"
import { toNonEmptyArray } from "../../Array.js"
import * as Option from "../../Option.js"
import * as S from "../../Schema.js"
import { dropUndefinedT } from "../../utils.js"
import type { FilterResult } from "../filter/filterApi.js"
import type { FieldValues } from "../filter/types.js"
import type { FieldPath } from "../filter/types/path/eager.js"
import { make, type Q, type QAll } from "../query/dsl.js"

export type AggregateIrExpression =
  | { readonly _tag: "agg-count" }
  | { readonly _tag: "agg-count-when"; readonly filter: readonly FilterResult[] }
  | { readonly _tag: "agg-sum"; readonly field: string }
  | { readonly _tag: "agg-min"; readonly field: string }
  | { readonly _tag: "agg-max"; readonly field: string }

export type AggregateIrItem =
  | AggregateIrExpression
  | { readonly _tag: "agg-field"; readonly path: string }

export type ComputedProjectionMathIrExpression =
  | {
    readonly _tag: "field"
    readonly field: string
  }
  | {
    readonly _tag: "mul"
    readonly left: ComputedProjectionMathIrExpression
    readonly right: ComputedProjectionMathIrExpression
  }

export type ComputedProjectionIrExpression =
  | {
    readonly _tag: "relation-count"
    readonly path: string
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-any"
    readonly path: string
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-every"
    readonly path: string
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-distinct-count"
    readonly path: string
    readonly field: string
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-sum"
    readonly path: string
    readonly field: string
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-sum-expr"
    readonly path: string
    readonly expression: ComputedProjectionMathIrExpression
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-sum-expr-by"
    readonly path: string
    readonly expression: ComputedProjectionMathIrExpression
    readonly unit: string
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-sum-expr-normalized"
    readonly path: string
    readonly expression: ComputedProjectionMathIrExpression
    readonly unit: string
    readonly toBase: string
    readonly factors: Readonly<Record<string, number>>
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-collect"
    readonly path: string
    readonly field: string
    readonly distinct: boolean
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-collect-fields"
    readonly path: string
    readonly fields: readonly string[]
    readonly distinct: boolean
    readonly filter: readonly FilterResult[]
  }
  | {
    readonly _tag: "relation-length"
    readonly path: string
  }

type Result<TFieldValues extends FieldValues, A = TFieldValues, R = never> = {
  filter: FilterResult[]
  schema: S.Codec<A, TFieldValues, R> | undefined
  limit: number | undefined
  skip: number | undefined
  order: { key: FieldPath<TFieldValues>; direction: "ASC" | "DESC" }[]
  ttype: "one" | "many" | "count" | undefined
  mode: "collect" | "project" | "transform" | "aggregate" | undefined
  computed: Record<string, ComputedProjectionIrExpression> | undefined
  aggregateMap: Record<string, AggregateIrItem> | undefined
}

const interpret = <
  TFieldValues extends FieldValues,
  TFieldValuesRefined extends TFieldValues = TFieldValues,
  A = TFieldValues,
  R = never
>(_: QAll<TFieldValues, TFieldValuesRefined, A, R>) => {
  const a = _ as Q<TFieldValues>

  const data: Result<TFieldValues, any, any> = {
    filter: [],
    schema: undefined,
    limit: undefined,
    skip: undefined,
    order: [],
    ttype: undefined,
    mode: undefined,
    computed: undefined,
    aggregateMap: undefined
  }

  const upd = (
    v: Result<TFieldValues, any, any>
  ) => {
    data.filter.push(...v.filter)
    data.order.push(...v.order)
    if (v.limit !== undefined) data.limit = v.limit
    if (v.skip !== undefined) data.skip = v.skip
    if (v.ttype !== undefined) data.ttype = v.ttype
    if (v.schema !== undefined) data.schema = v.schema
    if (v.mode !== undefined) data.mode = v.mode
    if (v.computed !== undefined) data.computed = v.computed
    if (v.aggregateMap !== undefined) data.aggregateMap = v.aggregateMap
  }

  const applyPath = (path: string) => (_: FilterResult): FilterResult =>
    _.t === "where" || _.t === "and" || _.t === "or"
      ? { ..._, path: `${path}.-1.${_.path}` }
      : { ..._, result: _.result.map(applyPath(path)) }

  pipe(
    a,
    Match.valueTags({
      value: () => {
        // data.filter.push(value)
      },
      where: ({ current, operation, relation, subPath }) => {
        upd(interpret(current))
        if (typeof operation === "function") {
          data.filter.push(
            {
              t: "where-scope",
              result: interpret(operation(make())).filter.map(subPath ? applyPath(subPath) : identity),
              relation
            }
          )
        } else {
          data.filter.push(
            {
              t: "where",
              path: operation[0],
              op: operation.length === 2 ? "eq" : operation[1],
              value: operation.length === 2 ? operation[1] : operation[2]
            }
          )
        }
      },
      and: ({ current, operation, relation }) => {
        upd(interpret(current))
        if (typeof operation === "function") {
          data.filter.push(
            { t: "and-scope", result: interpret(operation(make())).filter, relation }
          )
        } else {
          data.filter.push(
            {
              t: "and",
              path: operation[0],
              op: operation.length === 2 ? "eq" : operation[1],
              value: operation.length === 2 ? operation[1] : operation[2]
            }
          )
        }
      },
      or: ({ current, operation, relation }) => {
        upd(interpret(current))
        if (typeof operation === "function") {
          data.filter.push(
            { t: "or-scope", result: interpret(operation(make())).filter, relation }
          )
        } else {
          data.filter.push(
            {
              t: "or",
              path: operation[0],
              op: operation.length === 2 ? "eq" : operation[1],
              value: operation.length === 2 ? operation[1] : operation[2]
            }
          )
        }
      },
      one: ({ current }) => {
        upd(interpret(current))
        data.limit = 1
        data.ttype = "one"
      },
      count: ({ current }) => {
        upd(interpret(current))
        data.ttype = "count"
        data.schema = S.Struct({ id: S.String }) as any
      },
      order: ({ current, direction, field }) => {
        upd(interpret(current))
        data.order.push({ key: field, direction })
      },
      page: (v) => {
        upd(interpret(v.current))
        data.limit = v.take
        data.skip = v.skip
      },
      project: (v) => {
        upd(interpret(v.current))
        if (v.mode === "aggregate" && v.aggregateMap) {
          data.schema = v.schema
          data.mode = "aggregate"
          data.aggregateMap = Object.fromEntries(
            Object.entries(v.aggregateMap).map(([key, expression]) => {
              switch (expression._tag) {
                case "agg-field":
                  return [key, { _tag: "agg-field" as const, path: expression.path }]
                case "agg-count":
                  return [key, { _tag: "agg-count" as const }]
                case "agg-count-when": {
                  const filter = interpret(expression.operation(make())).filter
                  return [key, { _tag: "agg-count-when" as const, filter }]
                }
                case "agg-sum":
                  return [key, { _tag: "agg-sum" as const, field: expression.field }]
                case "agg-min":
                  return [key, { _tag: "agg-min" as const, field: expression.field }]
                case "agg-max":
                  return [key, { _tag: "agg-max" as const, field: expression.field }]
              }
            })
          )
          return
        }
        if (v.computed && v.mode === "transform") {
          throw new Error("Computed projections require mode 'project' or 'collect', not 'transform'")
        }
        data.schema = v.schema
        data.mode = v.computed
          ? v.mode === "collect" ? "collect" : "project"
          : v.mode
        data.computed = v.computed
          ? Object.fromEntries(
            Object.entries(v.computed).map(([key, expression]) => {
              const e = expression
              const op = "operation" in e ? e.operation : undefined
              const filter = op ? interpret(op(make())).filter.map(applyPath(e.path)) : []
              switch (e._tag) {
                case "relation-count":
                case "relation-any":
                case "relation-every":
                  return [key, { _tag: e._tag, path: e.path, filter } as ComputedProjectionIrExpression]
                case "relation-distinct-count":
                case "relation-sum":
                  return [
                    key,
                    { _tag: e._tag, path: e.path, field: e.field, filter } as ComputedProjectionIrExpression
                  ]
                case "relation-sum-expr":
                  return [
                    key,
                    { _tag: e._tag, path: e.path, expression: e.expression, filter } as ComputedProjectionIrExpression
                  ]
                case "relation-sum-expr-by":
                  return [
                    key,
                    {
                      _tag: e._tag,
                      path: e.path,
                      expression: e.expression,
                      unit: e.unit,
                      filter
                    } as ComputedProjectionIrExpression
                  ]
                case "relation-sum-expr-normalized":
                  return [
                    key,
                    {
                      _tag: e._tag,
                      path: e.path,
                      expression: e.expression,
                      unit: e.unit,
                      toBase: e.toBase,
                      factors: e.factors,
                      filter
                    } as ComputedProjectionIrExpression
                  ]
                case "relation-collect":
                  return [
                    key,
                    {
                      _tag: e._tag,
                      path: e.path,
                      field: e.field,
                      distinct: e.distinct,
                      filter
                    } as ComputedProjectionIrExpression
                  ]
                case "relation-collect-fields":
                  return [
                    key,
                    {
                      _tag: e._tag,
                      path: e.path,
                      fields: e.fields,
                      distinct: e.distinct,
                      filter
                    } as ComputedProjectionIrExpression
                  ]
                case "relation-length":
                  return [key, { _tag: e._tag, path: e.path } as ComputedProjectionIrExpression]
              }
            })
          )
          : undefined
      }
    })
  )

  return data
}

const walkTransformation = (t: S.AST.AST): S.AST.AST => {
  if (S.AST.isDeclaration(t) && t.typeParameters.length > 0) {
    return walkTransformation(t.typeParameters[0]!)
  }
  return t
}

export const toFilter = <
  TFieldValues extends FieldValues,
  A,
  R,
  TFieldValuesRefined extends TFieldValues = TFieldValues
>(
  q: QAll<TFieldValues, TFieldValuesRefined, A, R>,
  baseSchema?: S.Schema<unknown>
) => {
  // TODO: Native interpreter for each db adapter, instead of the intermediate "new-kid" format
  const a = interpret(q)

  // Aggregate mode: build select entirely from aggregateMap (no schema-driven field list)
  if (a.mode === "aggregate" && a.aggregateMap) {
    const aggSelect = Object.entries(a.aggregateMap).map(([key, item]) => {
      if (item._tag === "agg-field") {
        return { key, path: item.path }
      }
      return { key, aggregate: item }
    })
    return dropUndefinedT({
      t: null as unknown as TFieldValues,
      limit: a.limit,
      skip: a.skip,
      select: Option.getOrUndefined(toNonEmptyArray(aggSelect)) as any,
      schema: a.schema,
      computed: undefined,
      order: Option.getOrUndefined(toNonEmptyArray(a.order)),
      ttype: a.ttype,
      mode: "aggregate" as const,
      filter: a.filter.length ? a.filter : undefined
    })
  }

  const schema = a.schema
  let select: (keyof TFieldValues | { key: string; subKeys: string[] } | {
    key: string
    computed: ComputedProjectionIrExpression
  })[] = []
  // TODO: support more complex (nested) schemas?
  if (schema) {
    const t = walkTransformation(SchemaAST.toEncoded(schema.ast))
    if (S.AST.isObjects(t)) {
      select = t.propertySignatures.map((_) => _.name as string)
      for (const prop of t.propertySignatures) {
        if (S.AST.isArrays(prop.type)) {
          // make sure we only select when there are actually type literals in the tuple...
          // otherwise we might be dealing with strings etc.
          // TODO; be more strict, can't support arrays with unions that have non TypeLiteral members etc..
          const arraySelect = {
            key: prop.name as string,
            subKeys: Array.flatMap(
              prop.type.rest,
              (x) => {
                const t = walkTransformation(x)
                return S.AST.isObjects(t) ? t.propertySignatures.map((y) => y.name as string) : []
              }
            )
          }
          if (arraySelect.subKeys.length > 0) {
            select.push(arraySelect)
            // make sure we don't double select?
            if (select.includes(prop.name as string)) {
              select.splice(select.indexOf(prop.name as string), 1)
            }
          }
        }
      }
    }
  }
  const computed = a.computed
  const getSelectKey = (_: (typeof select)[number]) => {
    if (typeof _ === "string") {
      return _
    }
    if (typeof _ === "object" && _ !== null && "key" in _) {
      return _.key
    }
    return String(_)
  }
  const schemaKeys = select.map(getSelectKey)
  const nonEncodedSchemaKeys = (() => {
    if (!baseSchema) {
      return [] as string[]
    }
    const encoded = walkTransformation(SchemaAST.toEncoded(baseSchema.ast))
    if (!S.AST.isObjects(encoded)) {
      return [] as string[]
    }
    const encodedKeys = encoded.propertySignatures.map((_) => _.name as string)
    return schemaKeys.filter((key) => !encodedKeys.includes(key))
  })()
  const missingComputedKeys = nonEncodedSchemaKeys.filter((key) => !(computed && key in computed))

  if (Array.isArrayNonEmpty(missingComputedKeys)) {
    throw new Error(`Missing computed projections for schema keys: ${missingComputedKeys.join(", ")}`)
  }

  if (computed) {
    const computedKeys = Object.keys(computed)
    const extraComputedKeys = computedKeys.filter((key) => !schemaKeys.includes(key))
    if (Array.isArrayNonEmpty(extraComputedKeys)) {
      throw new Error(`Computed projection keys must exist in projection schema: ${extraComputedKeys.join(", ")}`)
    }
    select = select.filter((_) => {
      const key = getSelectKey(_)
      return !(key in computed)
    })
    select.push(...Object.entries(computed).map(([key, expression]) => ({ key, computed: expression })))
  }
  return dropUndefinedT({
    t: null as unknown as TFieldValues,
    limit: a.limit,
    skip: a.skip,
    select: Option.getOrUndefined(toNonEmptyArray(select)),
    schema,
    computed,
    order: Option.getOrUndefined(toNonEmptyArray(a.order)),
    ttype: a.ttype,
    mode: a.mode ?? "transform",
    filter: a.filter.length
      ? a.filter
      : undefined
  })
}
