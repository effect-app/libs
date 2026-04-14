/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, type NonEmptyReadonlyArray } from "effect-app"
import { assertUnreachable } from "effect-app/utils"
import { InfraLogger } from "../../logger.js"
import type { FilterR, FilterResult } from "../../Model/filter/filterApi.js"
import { isRelationCheck } from "../codeFilter.js"

export interface SQLDialect {
  readonly jsonExtract: (path: string) => string
  readonly jsonExtractJson: (path: string) => string
  readonly placeholder: (index: number) => string
  readonly jsonArrayContains: (arrPath: string, valPlaceholder: string) => string
  readonly jsonArrayNotContains: (arrPath: string, valPlaceholder: string) => string
  readonly jsonArrayContainsAny: (arrPath: string, valPlaceholders: readonly string[]) => string
  readonly jsonArrayNotContainsAny: (arrPath: string, valPlaceholders: readonly string[]) => string
  readonly jsonArrayContainsAll: (arrPath: string, valPlaceholders: readonly string[]) => string
  readonly jsonArrayNotContainsAll: (arrPath: string, valPlaceholders: readonly string[]) => string
  readonly caseInsensitiveLike: (expr: string, valPlaceholder: string) => string
  readonly caseInsensitiveNotLike: (expr: string, valPlaceholder: string) => string
  readonly jsonColumnType: "JSON" | "JSONB"
  readonly arrayLength: (path: string) => string
  readonly jsonEachFrom: (arrPath: string, alias: string) => string
  readonly jsonExtractElement: (alias: string, subPath: string) => string
}

export const sqliteDialect: SQLDialect = {
  jsonExtract: (path) => `json_extract(data, '$.${path}')`,
  jsonExtractJson: (path) => `json_quote(json_extract(data, '$.${path}'))`,
  placeholder: (_index) => "?",
  jsonArrayContains: (arrPath, val) => `EXISTS(SELECT 1 FROM json_each(data, '$.${arrPath}') WHERE value = ${val})`,
  jsonArrayNotContains: (arrPath, val) =>
    `NOT EXISTS(SELECT 1 FROM json_each(data, '$.${arrPath}') WHERE value = ${val})`,
  jsonArrayContainsAny: (arrPath, vals) =>
    `EXISTS(SELECT 1 FROM json_each(data, '$.${arrPath}') WHERE value IN (${vals.join(", ")}))`,
  jsonArrayNotContainsAny: (arrPath, vals) =>
    `NOT EXISTS(SELECT 1 FROM json_each(data, '$.${arrPath}') WHERE value IN (${vals.join(", ")}))`,
  jsonArrayContainsAll: (arrPath, vals) =>
    vals.map((v) => `EXISTS(SELECT 1 FROM json_each(data, '$.${arrPath}') WHERE value = ${v})`).join(" AND "),
  jsonArrayNotContainsAll: (arrPath, vals) =>
    `NOT (${
      vals.map((v) => `EXISTS(SELECT 1 FROM json_each(data, '$.${arrPath}') WHERE value = ${v})`).join(" AND ")
    })`,
  caseInsensitiveLike: (expr, val) => `LOWER(${expr}) LIKE LOWER(${val})`,
  caseInsensitiveNotLike: (expr, val) => `LOWER(${expr}) NOT LIKE LOWER(${val})`,
  jsonColumnType: "JSON",
  arrayLength: (path) => `json_array_length(data, '$.${path}')`,
  jsonEachFrom: (arrPath, alias) => `json_each(data, '$.${arrPath}') AS ${alias}`,
  jsonExtractElement: (alias, subPath) => `json_extract(${alias}.value, '$.${subPath}')`
}

export const pgDialect: SQLDialect = {
  jsonExtract: (path) => {
    const parts = path.split(".")
    if (parts.length === 1) return `data->>'${parts[0]}'`
    const last = parts.pop()!
    return `data${parts.map((p) => `->'${p}'`).join("")}->>'${last}'`
  },
  jsonExtractJson: (path) => {
    const parts = path.split(".")
    if (parts.length === 1) return `data->'${parts[0]}'`
    return `data${parts.map((p) => `->'${p}'`).join("")}`
  },
  placeholder: (index) => `$${index}`,
  jsonArrayContains: (arrPath, val) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return `${jsonPath} @> ${val}::jsonb`
  },
  jsonArrayNotContains: (arrPath, val) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return `NOT (${jsonPath} @> ${val}::jsonb)`
  },
  jsonArrayContainsAny: (arrPath, vals) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return `(${vals.map((v) => `${jsonPath} @> ${v}::jsonb`).join(" OR ")})`
  },
  jsonArrayNotContainsAny: (arrPath, vals) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return `NOT (${vals.map((v) => `${jsonPath} @> ${v}::jsonb`).join(" OR ")})`
  },
  jsonArrayContainsAll: (arrPath, vals) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return vals.map((v) => `${jsonPath} @> ${v}::jsonb`).join(" AND ")
  },
  jsonArrayNotContainsAll: (arrPath, vals) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return `NOT (${vals.map((v) => `${jsonPath} @> ${v}::jsonb`).join(" AND ")})`
  },
  caseInsensitiveLike: (expr, val) => `${expr} ILIKE ${val}`,
  caseInsensitiveNotLike: (expr, val) => `${expr} NOT ILIKE ${val}`,
  jsonColumnType: "JSONB",
  arrayLength: (path) => `jsonb_array_length(data->'${path}')`,
  jsonEachFrom: (arrPath, alias) => {
    const parts = arrPath.split(".")
    const jsonPath = parts.length === 1
      ? `data->'${parts[0]}'`
      : `data${parts.map((p) => `->'${p}'`).join("")}`
    return `jsonb_array_elements(${jsonPath}) AS ${alias}`
  },
  jsonExtractElement: (alias, subPath) => {
    const parts = subPath.split(".")
    if (parts.length === 1) return `${alias}->>'${parts[0]}'`
    const last = parts.pop()!
    return `${alias}${parts.map((p) => `->'${p}'`).join("")}->>'${last}'`
  }
}

export function logQuery(q: { sql: string; params: unknown[] }) {
  return InfraLogger
    .logDebug("sql query")
    .pipe(Effect.annotateLogs({
      query: q.sql,
      parameters: JSON.stringify(q.params, undefined, 2)
    }))
}

const dottedToJsonPath = (path: string) =>
  path
    .split(".")
    .filter((p) => p !== "-1")
    .join(".")

export function buildWhereSQLQuery(
  dialect: SQLDialect,
  idKey: PropertyKey,
  filter: readonly FilterResult[],
  tableName: string,
  defaultValues: Record<string, unknown>,
  select?: NonEmptyReadonlyArray<string | { key: string; subKeys: readonly string[] }>,
  order?: NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }>,
  skip?: number,
  limit?: number
) {
  const params: unknown[] = []
  let paramIndex = 1

  const addParam = (value: unknown): string => {
    params.push(value)
    return dialect.placeholder(paramIndex++)
  }

  const fieldExpr = (path: string, relation?: string): string => {
    if (path === idKey || path === "id") return "id"
    if (relation && path.includes(".-1.")) {
      const subPath = path.split(".-1.")[1]!
      if (subPath.endsWith(".length")) {
        // TODO: array length inside relation element
        return dialect.jsonExtractElement(`_${relation}`, subPath.slice(0, -".length".length))
      }
      return dialect.jsonExtractElement(`_${relation}`, subPath)
    }
    if (path.endsWith(".length")) {
      const arrPath = dottedToJsonPath(path.slice(0, -".length".length))
      return dialect.arrayLength(arrPath)
    }
    const jsonPath = dottedToJsonPath(path)
    const expr = dialect.jsonExtract(jsonPath)
    const topKey = path.split(".")[0]
    if (topKey in defaultValues) {
      return `COALESCE(${expr}, ${addParam(defaultValues[topKey])})`
    }
    return expr
  }

  const statement = (x: FilterR, relation?: string): string => {
    const resolvedPath = x.path === idKey ? "id" : x.path
    const k = fieldExpr(resolvedPath, relation)

    switch (x.op) {
      case "in": {
        const vals = x.value as unknown as readonly unknown[]
        const hasNull = vals.some((v) => v == null)
        const nonNullVals = vals.filter((v) => v != null)
        const parts: string[] = []
        if (nonNullVals.length > 0) {
          const placeholders = nonNullVals.map((v) => addParam(v))
          parts.push(`${k} IN (${placeholders.join(", ")})`)
        }
        if (hasNull) parts.push(`${k} IS NULL`)
        return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0] ?? "1=0"
      }
      case "notIn": {
        const vals = x.value as unknown as readonly unknown[]
        const hasNull = vals.some((v) => v == null)
        const nonNullVals = vals.filter((v) => v != null)
        const parts: string[] = []
        if (nonNullVals.length > 0) {
          const placeholders = nonNullVals.map((v) => addParam(v))
          parts.push(`${k} NOT IN (${placeholders.join(", ")})`)
        }
        if (hasNull) parts.push(`${k} IS NOT NULL`)
        return parts.length > 1 ? `(${parts.join(" AND ")})` : parts[0] ?? "1=1"
      }

      case "includes": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const v = addParam(x.value)
        return dialect.jsonArrayContains(arrPath, v)
      }
      case "notIncludes": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const v = addParam(x.value)
        return dialect.jsonArrayNotContains(arrPath, v)
      }

      case "includes-any": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(JSON.stringify(v)))
        return dialect.jsonArrayContainsAny(arrPath, placeholders)
      }
      case "notIncludes-any": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(JSON.stringify(v)))
        return dialect.jsonArrayNotContainsAny(arrPath, placeholders)
      }

      case "includes-all": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(JSON.stringify(v)))
        return dialect.jsonArrayContainsAll(arrPath, placeholders)
      }
      case "notIncludes-all": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(JSON.stringify(v)))
        return dialect.jsonArrayNotContainsAll(arrPath, placeholders)
      }

      case "contains": {
        const v = addParam(`%${x.value}%`)
        return dialect.caseInsensitiveLike(k, v)
      }
      case "notContains": {
        const v = addParam(`%${x.value}%`)
        return dialect.caseInsensitiveNotLike(k, v)
      }
      case "startsWith": {
        const v = addParam(`${x.value}%`)
        return dialect.caseInsensitiveLike(k, v)
      }
      case "notStartsWith": {
        const v = addParam(`${x.value}%`)
        return dialect.caseInsensitiveNotLike(k, v)
      }
      case "endsWith": {
        const v = addParam(`%${x.value}`)
        return dialect.caseInsensitiveLike(k, v)
      }
      case "notEndsWith": {
        const v = addParam(`%${x.value}`)
        return dialect.caseInsensitiveNotLike(k, v)
      }

      case "lt": {
        const v = addParam(x.value)
        return `${k} < ${v}`
      }
      case "lte": {
        const v = addParam(x.value)
        return `${k} <= ${v}`
      }
      case "gt": {
        const v = addParam(x.value)
        return `${k} > ${v}`
      }
      case "gte": {
        const v = addParam(x.value)
        return `${k} >= ${v}`
      }
      case "neq": {
        if (x.value === null) return `${k} IS NOT NULL`
        const v = addParam(x.value)
        return `${k} <> ${v}`
      }
      case undefined:
      case "eq": {
        if (x.value === null) return `${k} IS NULL`
        const v = addParam(x.value)
        return `${k} = ${v}`
      }
      default:
        return assertUnreachable(x.op)
    }
  }

  const wrapRelation = (rel: string, inner: string, every: boolean): string => {
    // Optimize tautological/contradictory conditions
    if (every && inner === "1=1") return "1=1"
    if (!every && inner === "1=0") return "1=0"
    const from = dialect.jsonEachFrom(rel, `_${rel}`)
    // ∀x.P(x) ≡ ¬∃x.¬P(x), i.e. NOT EXISTS(... WHERE NOT P)
    return every
      ? `NOT EXISTS(SELECT 1 FROM ${from} WHERE NOT (${inner}))`
      : `EXISTS(SELECT 1 FROM ${from} WHERE ${inner})`
  }

  const print = (state: readonly FilterResult[], isRelation: string | null, every: boolean): string => {
    let s = ""
    for (const e of state) {
      switch (e.t) {
        case "where":
          s += statement(e, isRelation ?? undefined)
          break
        case "or":
          s += ` OR ${statement(e, isRelation ?? undefined)}`
          break
        case "and":
          s += ` AND ${statement(e, isRelation ?? undefined)}`
          break
        case "or-scope": {
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            s += isRelation
              ? ` OR (${print(e.result, rel, every)})`
              : ` OR ${wrapRelation(rel, print(e.result, rel, every), every)}`
          } else {
            s += ` OR (${print(e.result, null, every)})`
          }
          break
        }
        case "and-scope": {
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            s += isRelation
              ? ` AND (${print(e.result, rel, every)})`
              : ` AND ${wrapRelation(rel, print(e.result, rel, every), every)}`
          } else {
            s += ` AND (${print(e.result, null, every)})`
          }
          break
        }
        case "where-scope": {
          if (!every) every = e.relation === "every"
          const rel = isRelationCheck(e.result, isRelation)
          if (rel) {
            s += isRelation
              ? `(${print(e.result, rel, every)})`
              : wrapRelation(rel, print(e.result, rel, every), every)
          } else {
            s += `(${print(e.result, null, every)})`
          }
          break
        }
      }
    }
    return s
  }

  const getSelectExpr = (): string => {
    if (!select) return "id, _etag, data"
    const fields = select.map((s) => {
      if (typeof s === "string") {
        if (s === idKey || s === "id") return `id`
        if (s === "_etag") return `_etag`
        return `${dialect.jsonExtractJson(s)} AS "${s}"`
      }
      return `${dialect.jsonExtractJson(s.key)} AS "${s.key}"`
    })
    return fields.join(", ")
  }

  const whereClause = filter.length
    ? `WHERE ${print([{ t: "where-scope", result: filter, relation: "some" }], null, false)}`
    : ""

  const orderClause = order
    ? `ORDER BY ${order.map((_) => `${fieldExpr(_.key)} ${_.direction}`).join(", ")}`
    : ""

  const limitClause = limit !== undefined || skip !== undefined
    ? `LIMIT ${addParam(limit ?? 999999)} OFFSET ${addParam(skip ?? 0)}`
    : ""

  const sql = `SELECT ${getSelectExpr()} FROM "${tableName}" ${whereClause} ${orderClause} ${limitClause}`.trim()

  return { sql, params }
}
