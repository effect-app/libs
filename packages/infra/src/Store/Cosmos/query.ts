/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import * as Array from "effect-app/Array"
import type { NonEmptyReadonlyArray } from "effect-app/Array"
import * as Effect from "effect-app/Effect"
import type { FilterR, FilterResult, Ops } from "effect-app/Model/filter/filterApi"
import type { AggregateIrExpression, ComputedProjectionIrExpression, ComputedProjectionMathIrExpression } from "effect-app/Model/query"
import type { SupportedValues } from "effect-app/Store"
import { assertUnreachable } from "effect-app/utils"
import { InfraLogger } from "../../logger.js"
import { isRelationCheck } from "../codeFilter.js"

export function logQuery(q: {
  query: string
  parameters: {
    name: string
    value: SupportedValues | readonly SupportedValues[]
  }[]
}) {
  return InfraLogger
    .logDebug("cosmos query")
    .pipe(Effect.annotateLogs({
      query: q.query,
      parameters: JSON.stringify(
        q.parameters.reduce((acc, v) => {
          acc[v.name] = v.value
          return acc
        }, {} as Record<string, SupportedValues | readonly SupportedValues[]>),
        undefined,
        2
      )
    }))
}

const dottedToAccess = (path: string) =>
  path
    .split(".")
    .map((p, i) => i === 0 ? p : `["${p}"]`)
    .join("")

export function buildWhereCosmosQuery3(
  idKey: PropertyKey,
  filter: readonly FilterResult[],
  name: string,
  defaultValues: Record<string, unknown>,
  select?: NonEmptyReadonlyArray<
    string | {
      key: string
      subKeys: readonly string[]
    } | {
      key: string
      computed: ComputedProjectionIrExpression
    } | {
      key: string
      path: string
    } | {
      key: string
      aggregate: AggregateIrExpression
    }
  >,
  order?: NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }>,
  skip?: number,
  limit?: number
) {
  const statement = (x: FilterR, i: number) => {
    if (x.path === idKey) {
      x = { ...x, path: "id" }
    }
    let k = x.path.includes(".-1.")
      ? dottedToAccess(`${x.path.split(".-1.")[0]}.${x.path.split(".-1.")[1]!}`)
      : x.path.endsWith(".length")
      ? `ARRAY_LENGTH(${dottedToAccess(`f.${x.path.split(".length")[0]}`)})`
      : dottedToAccess(`f.${x.path}`)

    // would have to map id, but shouldnt allow id in defaultValues anyway..
    k = x.path in defaultValues ? `(${k} ?? ${JSON.stringify(defaultValues[x.path])})` : k

    const v = "@v" + i

    switch (x.op) {
      case "in":
        return `ARRAY_CONTAINS(${v}, ${k})`
      case "notIn":
        return `(NOT ARRAY_CONTAINS(${v}, ${k}))`

      case "includes":
        return `ARRAY_CONTAINS(${k}, ${v})`
      case "notIncludes":
        return `(NOT ARRAY_CONTAINS(${k}, ${v}))`

      case "includes-any":
        return `ARRAY_CONTAINS_ANY(${k}, ${
          (x.value as unknown as readonly unknown[]).map((_, i) => `${v}__${i}`).join(", ")
        })`
      case "notIncludes-any":
        return `(NOT ARRAY_CONTAINS_ANY(${k}, ${
          (x.value as unknown as readonly unknown[]).map((_, i) => `${v}__${i}`).join(", ")
        }))`

      case "includes-all":
        return `ARRAY_CONTAINS_ALL(${k}, ${
          (x.value as unknown as readonly unknown[]).map((_, i) => `${v}__${i}`).join(", ")
        })`
      case "notIncludes-all":
        return `(NOT ARRAY_CONTAINS_ALL(${k}, ${
          (x.value as unknown as readonly unknown[]).map((_, i) => `${v}__${i}`).join(", ")
        }))`

      case "contains":
        return `CONTAINS(${k}, ${v}, true)`

      case "startsWith":
        return `STARTSWITH(${k}, ${v}, true)`
      case "endsWith":
        return `ENDSWITH(${k}, ${v}, true)`
      case "notContains":
        return `NOT(CONTAINS(${k}, ${v}, true))`
      case "notStartsWith":
        return `NOT(STARTSWITH(${k}, ${v}, true))`
      case "notEndsWith":
        return `NOT(ENDSWITH(${k}, ${v}, true))`
    }

    switch (x.op) {
      case "lt":
        return `${k} < ${v}`
      case "lte":
        return `${k} <= ${v}`
      case "gt":
        return `${k} > ${v}`
      case "gte":
        return `${k} >= ${v}`
      case "neq":
        return x.value === null
          ? `IS_NULL(${k}) = false`
          : `${k} <> ${v}`
      case undefined:
      case "eq":
        return x.value === null
          ? `IS_NULL(${k}) = true`
          : `${k} = ${v}`
      default: {
        return assertUnreachable(x.op)
      }
    }
  }

  let i = 0

  const flipOps = {
    gt: "lt",
    lt: "gt",
    gte: "lte",
    lte: "gte",
    contains: "notContains",
    notContains: "contains",
    startsWith: "notStartsWith",
    notStartsWith: "startsWith",
    endsWith: "notEndsWith",
    notEndsWith: "endsWith",
    eq: "neq",
    neq: "eq",
    includes: "notIncludes",
    notIncludes: "includes",
    "includes-any": "notIncludes-any",
    "notIncludes-any": "includes-any",
    "includes-all": "notIncludes-all",
    "notIncludes-all": "includes-all",
    in: "notIn",
    notIn: "in"
  } satisfies Record<Ops, Ops>

  const flippies = {
    and: "or",
    or: "and"
  } satisfies Record<"and" | "or", "and" | "or">

  const flip = (every: boolean) => (_: FilterResult): FilterResult =>
    every
      ? _.t === "where" || _.t === "or" || _.t === "and"
        ? {
          ..._,
          t: _.t === "where"
            ? _.t
            : flippies[_.t],
          op: flipOps[_.op]
        }
        : _
      : _

  const print = (state: readonly FilterResult[], isRelation: string | null, every: boolean) => {
    let s = ""
    let l = 0
    const printN = (n: number) => {
      return n === 0 ? "" : Array.range(1, n).map(() => "  ").join("")
    }
    for (const e of state) {
      switch (e.t) {
        case "where":
          s += statement(e, i++)
          break
        case "or":
          s += ` OR ${statement(e, i++)}`
          break
        case "and":
          s += ` AND ${statement(e, i++)}`
          break
        case "or-scope": {
          ++l
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
            s += isRelation
              ? ` OR (\n${printN(l + 1)}${print(e.result, rel, every)}\n${printN(l)})`
              : ` OR (\n${printN(l + 1)}${
                every ? "NOT " : ""
              }EXISTS(SELECT VALUE ${rel} FROM ${rel} IN f.${rel} WHERE ${
                print(
                  e
                    .result
                    .map(flip(every)),
                  rel,
                  every
                )
              }))`
          } else {
            s += ` OR (\n${printN(l + 1)}${print(e.result, null, every)}\n${printN(l)})`
          }
          --l
          break
        }
        case "and-scope": {
          ++l
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
            s += isRelation
              ? ` AND (\n${printN(l + 1)}${print(e.result, rel, every)}\n${printN(l)})`
              : ` AND (\n${printN(l + 1)}${
                every ? "NOT " : ""
              }EXISTS(SELECT VALUE ${rel} FROM ${rel} IN f.${rel} WHERE ${
                print(e.result.map(flip(every)), rel, every)
              }))`
          } else {
            s += ` AND (\n${printN(l + 1)}${print(e.result, null, every)}\n${printN(l)})`
          }
          --l
          break
        }
        case "where-scope": {
          // ;++l
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
            s += isRelation
              ? `(\n${printN(l + 1)}${print(e.result, rel, every)}\n${printN(l)})`
              : `(\n${printN(l + 1)}${every ? "NOT " : ""}EXISTS(SELECT VALUE ${rel} FROM ${rel} IN f.${rel} WHERE ${
                print(e.result.map(flip(every)), rel, every)
              }))`
          } else {
            s += `(\n${printN(l + 1)}${print(e.result, null, every)}\n${printN(l)})`
          }
          // ;--l
          break
        }
      }
    }
    return s
  }

  // const fff = (filter: readonly FilterR[], mode: "AND" | "OR") =>
  //   "(" + filter
  //     .map((_) =>
  //       _.path.includes(".-1.")
  //         ? { ..._, f: _.path.split(".-1.")[0], key: _.path.split(".-1.")[1]! }
  //         : { ..._, f: "f" }
  //     )
  //     .map(
  //       (x, i) => {
  //         const k = `${x.f}.${x.path}`
  //         const v = `@v${i}`

  //         return statement(x, k, v)
  //       }
  //     )
  //     .join(mode === "OR" ? " OR " : " AND ") + ")"
  const getValues = (filter: readonly FilterResult[]): FilterR[] =>
    filter
      .flatMap((_) =>
        _.t === "and-scope" || _.t === "or-scope" || _.t === "where-scope"
          ? getValues(_.result)
          : [_]
      )
  const computedFilters = select
    ? select.flatMap((_) =>
      typeof _ === "object" && "computed" in _ && "filter" in _.computed ? getValues(_.computed.filter) : []
    )
    : []
  const aggregateFilters = select
    ? select.flatMap((_) =>
      typeof _ === "object" && "aggregate" in _ && "filter" in _.aggregate ? getValues(_.aggregate.filter) : []
    )
    : []
  const values = [...computedFilters, ...aggregateFilters, ...getValues(filter)]

  const hasAggregates = select
    ? select.some((s) => typeof s === "object" && s !== null && "aggregate" in s)
    : false

  const aggregateSelectExpr = (key: string, agg: AggregateIrExpression): string => {
    switch (agg._tag) {
      case "agg-count":
        return `COUNT(1) AS ${key}`
      case "agg-count-when": {
        if (agg.filter.length === 0) return `COUNT(1) AS ${key}`
        const cond = print(agg.filter, null, false)
        // Cosmos supports SUM(IIF(cond, 1, 0)) as a conditional count
        return `SUM(IIF(${cond}, 1, 0)) AS ${key}`
      }
      case "agg-sum": {
        const fieldRef = dottedToAccess(`f.${agg.field}`)
        return `SUM(${fieldRef}) AS ${key}`
      }
      case "agg-min": {
        const fieldRef = dottedToAccess(`f.${agg.field}`)
        return `MIN(${fieldRef}) AS ${key}`
      }
      case "agg-max": {
        const fieldRef = dottedToAccess(`f.${agg.field}`)
        return `MAX(${fieldRef}) AS ${key}`
      }
      default:
        return assertUnreachable(agg)
    }
  }

  const computedSelectExpr = (key: string, computed: ComputedProjectionIrExpression) => {
    const relationPath = computed.path
    const relationAlias = relationPath
    const relationSource = dottedToAccess(`f.${relationPath}`)
    const compileExpr = (expression: ComputedProjectionMathIrExpression): string => {
      switch (expression._tag) {
        case "field":
          return dottedToAccess(`${relationAlias}.${expression.field}`)
        case "mul":
          return `(${compileExpr(expression.left)} * ${compileExpr(expression.right)})`
        default:
          return assertUnreachable(expression)
      }
    }
    const factorExpr = (unitExpr: string, toBase: string, factors: Readonly<Record<string, number>>) => {
      const entries = Object.entries(factors).filter(([, factor]) => Number.isFinite(factor))
      return entries.reduceRight<string>(
        (acc, [unit, factor]) => `IIF(${unitExpr} = ${JSON.stringify(unit)}, ${factor}, ${acc})`,
        `IIF(${unitExpr} = ${JSON.stringify(toBase)}, 1, 0)`
      )
    }
    const filter = "filter" in computed ? computed.filter : []
    // Print filter once — `print` mutates the outer `i` parameter counter, so
    // re-walking the same filter would double-bump it and desync @v indices.
    const filterSql = filter.length > 0 ? print(filter, relationPath, false) : ""
    const where = filterSql ? ` WHERE ${filterSql}` : ""
    switch (computed._tag) {
      case "relation-count":
        return `(SELECT VALUE COUNT(1) FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
      case "relation-any":
        return `EXISTS(SELECT VALUE ${relationAlias} FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
      case "relation-every": {
        // ∀x.P(x) ≡ ¬∃x.¬P(x). Cosmos has no NOT(...) on EXISTS subqueries directly,
        // but we can flip via NOT EXISTS(... WHERE NOT (filter)).
        if (filter.length === 0) return `true AS ${key}`
        return `NOT EXISTS(SELECT VALUE ${relationAlias} FROM ${relationAlias} IN ${relationSource} WHERE NOT (${filterSql})) AS ${key}`
      }
      case "relation-distinct-count": {
        const fieldRef = dottedToAccess(`${relationAlias}.${computed.field}`)
        return `(SELECT VALUE COUNT(1) FROM (SELECT DISTINCT VALUE ${fieldRef} FROM ${relationAlias} IN ${relationSource}${where})) AS ${key}`
      }
      case "relation-sum": {
        const fieldRef = dottedToAccess(`${relationAlias}.${computed.field}`)
        return `(SELECT VALUE SUM(${fieldRef}) FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
      }
      case "relation-sum-expr": {
        const expression = compileExpr(computed.expression)
        return `(SELECT VALUE SUM(${expression}) FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
      }
      case "relation-sum-expr-by": {
        const unitRef = dottedToAccess(`${relationAlias}.${computed.unit}`)
        const expression = compileExpr(computed.expression)
        return `ARRAY(SELECT VALUE { "unit": ${unitRef}, "total": SUM(${expression}) } FROM ${relationAlias} IN ${relationSource}${where} GROUP BY ${unitRef}) AS ${key}`
      }
      case "relation-sum-expr-normalized": {
        const unitRef = dottedToAccess(`${relationAlias}.${computed.unit}`)
        const expression = compileExpr(computed.expression)
        const factor = factorExpr(unitRef, computed.toBase, computed.factors)
        return `(SELECT VALUE SUM((${expression}) * (${factor})) FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
      }
      case "relation-collect": {
        const fieldRef = dottedToAccess(`${relationAlias}.${computed.field}`)
        if (computed.distinct) {
          return `ARRAY(SELECT DISTINCT VALUE ${fieldRef} FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
        }
        return `ARRAY(SELECT VALUE ${fieldRef} FROM ${relationAlias} IN ${relationSource}${where}) AS ${key}`
      }
      case "relation-length":
        return `ARRAY_LENGTH(${relationSource}) AS ${key}`
      case "relation-collect-fields": {
        const subqueries = computed.fields.map((field) => {
          const fieldRef = dottedToAccess(`${relationAlias}.${field}`)
          return computed.distinct
            ? `ARRAY(SELECT DISTINCT VALUE ${fieldRef} FROM ${relationAlias} IN ${relationSource}${where})`
            : `ARRAY(SELECT VALUE ${fieldRef} FROM ${relationAlias} IN ${relationSource}${where})`
        })
        const combined = computed.distinct
          ? subqueries.reduce((acc, sq) => `SetUnion(${acc}, ${sq})`)
          : subqueries.reduce((acc, sq) => `ARRAY_CONCAT(${acc}, ${sq})`)
        return `${combined} AS ${key}`
      }
    }
  }

  const buildSelectList = (): string => {
    if (!select) return "f"
    return select
      .map((s) => {
        if (typeof s === "string") {
          return dottedToAccess(s === idKey ? "f.id" : `f.${s}`)
        }
        if ("computed" in s) return computedSelectExpr(s.key, s.computed)
        if ("aggregate" in s) return aggregateSelectExpr(s.key, s.aggregate)
        if ("path" in s) return `${dottedToAccess(`f.${s.path}`)} AS ${s.key}`
        // subKeys
        return `ARRAY (SELECT ${s.subKeys.map((_) => dottedToAccess(`t.${_}`)).join(",")}
                FROM t in ${dottedToAccess(`f.${s.key}`)}) AS ${s.key}`
      })
      .join(", ")
  }

  const groupByClause = hasAggregates && select
    ? (() => {
      const groupByExprs = select
        .filter((s): s is { key: string; path: string } =>
          typeof s === "object" && s !== null && "path" in s && !("aggregate" in s)
        )
        .map((s) => dottedToAccess(`f.${s.path}`))
      return groupByExprs.length > 0 ? `GROUP BY ${groupByExprs.join(", ")}` : ""
    })()
    : ""

  const orderExpr = (key: string) => hasAggregates ? key : dottedToAccess(`f.${key}`)

  // with joins, you should use DISTINCT
  // or you can end up with duplicates
  return {
    query: `
    SELECT ${buildSelectList()}
    FROM ${name} f

    ${filter.length ? `WHERE (${print(filter, null, false)})` : ""}
    ${groupByClause}
    ${order ? `ORDER BY ${order.map((_) => `${orderExpr(_.key)} ${_.direction}`).join(", ")}` : ""}
    ${skip !== undefined || limit !== undefined ? `OFFSET ${skip ?? 0} LIMIT ${limit ?? 999999}` : ""}`,
    parameters: values
      .flatMap((x, i) =>
        [{
          name: `@v${i}`,
          value: x.value as any
        }]
          // TODO: only for arrays that are used with _ANY or _ALL
          .concat(Array.isArray(x.value) ? x.value.map((_, i2) => ({ name: `@v${i}__${i2}`, value: _ as any })) : [])
      )
  }
}
