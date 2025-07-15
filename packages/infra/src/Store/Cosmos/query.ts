/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Array, Effect, type NonEmptyReadonlyArray } from "effect-app"
import { assertUnreachable } from "effect-app/utils"
import { InfraLogger } from "../../logger.js"
import type { FilterR, FilterResult, Ops } from "../../Model/filter/filterApi.js"
import { isRelationCheck } from "../codeFilter.js"
import type { SupportedValues } from "../service.js"

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
  importedMarkerId: string,
  defaultValues: Record<string, unknown>,
  select?: NonEmptyReadonlyArray<string | { key: string; subKeys: readonly string[] }>,
  order?: NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }>,
  skip?: number,
  limit?: number
) {
  const statement = (x: FilterR, i: number, values: any[]) => {
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

    const realValue = values[i]

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
        return `ARRAY_CONTAINS_ANY(${k}, ${(realValue as any[]).map((_, i) => `${v}__${i}`).join(", ")})`
      case "notIncludes-any":
        return `(NOT ARRAY_CONTAINS_ANY(${k}, ${(realValue as any[]).map((_, i) => `${v}__${i}`).join(", ")}))`

      case "includes-all":
        return `ARRAY_CONTAINS_ALL(${k}, ${(realValue as any[]).map((_, i) => `${v}__${i}`).join(", ")})`
      case "notIncludes-all":
        return `(NOT ARRAY_CONTAINS_ALL(${k}, ${(realValue as any[]).map((_, i) => `${v}__${i}`).join(", ")}))`

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

  const print = (state: readonly FilterResult[], values: any[], isRelation: string | null, every: boolean) => {
    let s = ""
    let l = 0
    const printN = (n: number) => {
      return n === 0 ? "" : Array.range(1, n).map(() => "  ").join("")
    }
    for (const e of state) {
      switch (e.t) {
        case "where":
          s += statement(e, i++, values)
          break
        case "or":
          s += ` OR ${statement(e, i++, values)}`
          break
        case "and":
          s += ` AND ${statement(e, i++, values)}`
          break
        case "or-scope": {
          ++l
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
            s += isRelation
              ? ` OR (\n${printN(l + 1)}${print(e.result, values, isRelation, every)}\n${printN(l)})`
              : ` OR (\n${printN(l + 1)}${
                every ? "NOT " : ""
              }EXISTS(SELECT VALUE ${rel} FROM ${rel} IN f.${rel} WHERE ${
                print(
                  e
                    .result
                    .map(flip(every)),
                  values,
                  isRelation,
                  every
                )
              }))`
          } else {
            s += ` OR (\n${printN(l + 1)}${print(e.result, values, isRelation, every)}\n${printN(l)})`
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
              ? ` AND (\n${printN(l + 1)}${print(e.result, values, isRelation, every)}\n${printN(l)})`
              : ` AND (\n${printN(l + 1)}${
                every ? "NOT " : ""
              }EXISTS(SELECT VALUE ${rel} FROM ${rel} IN f.${rel} WHERE ${
                print(e.result.map(flip(every)), values, isRelation, every)
              }))`
          } else {
            s += ` AND (\n${printN(l + 1)}${print(e.result, values, isRelation, every)}\n${printN(l)})`
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
              ? `(\n${printN(l + 1)}${print(e.result, values, isRelation, every)}\n${printN(l)})`
              : `(\n${printN(l + 1)}${every ? "NOT " : ""}EXISTS(SELECT VALUE ${rel} FROM ${rel} IN f.${rel} WHERE ${
                print(e.result.map(flip(every)), values, isRelation, every)
              }))`
          } else {
            s += `(\n${printN(l + 1)}${print(e.result, values, isRelation, every)}\n${printN(l)})`
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
  const values = getValues(filter)
  // with joins, you should use DISTINCT
  // or you can end up with duplicates
  return {
    query: `
    SELECT ${
      select
        ? `${
          select
            .map((s) =>
              typeof s === "string"
                ? dottedToAccess(s === idKey ? "f.id" : `f.${s}`) // x["y"} vs x.y, helps with reserved keywords like "value"
                : `ARRAY (SELECT ${s.subKeys.map((_) => dottedToAccess(`t.${_}`)).join(",")}
                FROM t in ${dottedToAccess(`f.${s.key}`)}) AS ${s.key}`
            )
            .join(", ")
        }`
        : "f"
    }
    FROM ${name} f

    WHERE f.id != @id ${filter.length ? `AND (${print(filter, values.map((_) => _.value), null, false)})` : ""}
    ${order ? `ORDER BY ${order.map((_) => `${dottedToAccess(`f.${_.key}`)} ${_.direction}`).join(", ")}` : ""}
    ${skip !== undefined || limit !== undefined ? `OFFSET ${skip ?? 0} LIMIT ${limit ?? 999999}` : ""}`,
    parameters: [
      { name: "@id", value: importedMarkerId },
      ...values
        .flatMap((x, i) =>
          [{
            name: `@v${i}`,
            value: x.value as any
          }]
            // TODO: only for arrays that are used with _ANY or _ALL
            .concat(Array.isArray(x.value) ? x.value.map((_, i2) => ({ name: `@v${i}__${i2}`, value: _ as any })) : [])
        )
    ]
  }
}
