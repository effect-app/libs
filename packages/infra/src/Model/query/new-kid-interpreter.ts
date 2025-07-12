/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Array, Match, Option, pipe, S } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { dropUndefinedT } from "effect-app/utils"
import type { FilterResult } from "../filter/filterApi.js"
import type { FieldValues } from "../filter/types.js"
import type { FieldPath } from "../filter/types/path/eager.js"
import { make, type Q, type QAll } from "../query/dsl.js"

type Result<TFieldValues extends FieldValues, A = TFieldValues, R = never> = {
  filter: FilterResult[]
  schema: S.Schema<A, TFieldValues, R> | undefined
  limit: number | undefined
  skip: number | undefined
  order: { key: FieldPath<TFieldValues>; direction: "ASC" | "DESC" }[]
  ttype: "one" | "many" | "count" | undefined
  mode: "collect" | "project" | "transform" | undefined
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
    mode: undefined
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
  }

  pipe(
    a,
    Match.valueTags({
      value: () => {
        // data.filter.push(value)
      },
      where: ({ current, operation }) => {
        upd(interpret(current))
        if (typeof operation === "function") {
          data.filter.push(
            { t: "where-scope", result: interpret(operation(make())).filter }
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
      and: ({ current, operation }) => {
        upd(interpret(current))
        if (typeof operation === "function") {
          data.filter.push(
            { t: "and-scope", result: interpret(operation(make())).filter }
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
      or: ({ current, operation }) => {
        upd(interpret(current))
        if (typeof operation === "function") {
          data.filter.push(
            { t: "or-scope", result: interpret(operation(make())).filter }
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
        data.schema = v.schema
        data.mode = v.mode
      }
    })
  )

  return data
}

const walkTransformation = (t: S.AST.AST) => {
  if (S.AST.isTransformation(t)) {
    return walkTransformation(t.from)
  }
  return t
}

export const toFilter = <
  TFieldValues extends FieldValues,
  A,
  R,
  TFieldValuesRefined extends TFieldValues = TFieldValues
>(
  q: QAll<TFieldValues, TFieldValuesRefined, A, R>
) => {
  // TODO: Native interpreter for each db adapter, instead of the intermediate "new-kid" format
  const a = interpret(q)
  const schema = a.schema
  let select: (keyof TFieldValues | { key: string; subKeys: string[] })[] = []
  // TODO: support more complex (nested) schemas?
  if (schema) {
    const t = walkTransformation(schema.ast)
    if (S.AST.isTypeLiteral(t)) {
      select = t.propertySignatures.map((_) => _.name as string)
      for (const prop of t.propertySignatures) {
        if (S.AST.isTupleType(prop.type)) {
          // make sure we only select when there are actually type literals in the tuple...
          // otherwise we might be dealing with strings etc.
          // TODO; be more strict, can't support arrays with unions that have non TypeLiteral members etc..
          const arraySelect = {
            key: prop.name as string,
            subKeys: Array.flatMap(
              prop.type.rest,
              (x) => {
                const t = walkTransformation(x.type)
                return S.AST.isTypeLiteral(t) ? t.propertySignatures.map((y) => y.name as string) : []
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
  return dropUndefinedT({
    t: null as unknown as TFieldValues,
    limit: a.limit,
    skip: a.skip,
    select: Option.getOrUndefined(toNonEmptyArray(select)),
    schema,
    order: Option.getOrUndefined(toNonEmptyArray(a.order)),
    ttype: a.ttype,
    mode: a.mode ?? "transform",
    filter: a.filter.length
      ? a.filter
      : undefined
  })
}
