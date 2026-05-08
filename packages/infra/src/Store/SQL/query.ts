/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, type NonEmptyReadonlyArray } from "effect-app"
import { assertUnreachable } from "effect-app/utils"
import { InfraLogger } from "../../logger.js"
import type { FilterR, FilterResult } from "../../Model/filter/filterApi.js"
import type { ComputedProjectionIrExpression, ComputedProjectionMathIrExpression } from "../../Model/query.js"
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
  readonly serializeJsonValue: (v: unknown) => unknown
  readonly serializeScalar: (v: unknown) => unknown
}

export const sqliteDialect: SQLDialect = {
  jsonExtract: (path) => `json_extract(data, '$.${path}')`,
  jsonExtractJson: (path) =>
    `CASE json_type(data, '$.${path}') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE json_quote(json_extract(data, '$.${path}')) END`,
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
  jsonExtractElement: (alias, subPath) => `json_extract(${alias}.value, '$.${subPath}')`,
  serializeJsonValue: (v) => v,
  // SQLite stores JSON booleans as integers (0/1) and better-sqlite3 refuses
  // to bind JS booleans, so coerce them to integers for WHERE params.
  serializeScalar: (v) => typeof v === "boolean" ? (v ? 1 : 0) : v
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
  },
  serializeJsonValue: (v) => JSON.stringify(v),
  // PG's ->> operator yields text, so compare booleans as 'true'/'false' text.
  serializeScalar: (v) => typeof v === "boolean" ? (v ? "true" : "false") : v
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

const sqlStringLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`

export function buildWhereSQLQuery(
  dialect: SQLDialect,
  idKey: PropertyKey,
  filter: readonly FilterResult[],
  tableName: string,
  defaultValues: Record<string, unknown>,
  select?: NonEmptyReadonlyArray<
    string | {
      key: string
      subKeys: readonly string[]
    } | {
      key: string
      computed: ComputedProjectionIrExpression
    }
  >,
  order?: NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }>,
  skip?: number,
  limit?: number,
  namespace?: string
) {
  const params: unknown[] = []
  let paramIndex = 1

  const addParam = (value: unknown): string => {
    params.push(dialect.serializeScalar(value))
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
        const placeholders = vals.map((v) => addParam(dialect.serializeJsonValue(v)))
        return dialect.jsonArrayContainsAny(arrPath, placeholders)
      }
      case "notIncludes-any": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(dialect.serializeJsonValue(v)))
        return dialect.jsonArrayNotContainsAny(arrPath, placeholders)
      }

      case "includes-all": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(dialect.serializeJsonValue(v)))
        return dialect.jsonArrayContainsAll(arrPath, placeholders)
      }
      case "notIncludes-all": {
        const arrPath = dottedToJsonPath(resolvedPath)
        const vals = x.value as unknown as readonly unknown[]
        const placeholders = vals.map((v) => addParam(dialect.serializeJsonValue(v)))
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

  const computedSelectExpr = (key: string, computed: ComputedProjectionIrExpression): string => {
    const relationPath = dottedToJsonPath(computed.path)
    const relationAlias = `_${computed.path}`
    const relationFrom = dialect.jsonEachFrom(relationPath, relationAlias)
    const toNumber = (expr: string) =>
      dialect.jsonColumnType === "JSON" ? `CAST(${expr} AS REAL)` : `(${expr})::numeric`
    const compileExpr = (expression: ComputedProjectionMathIrExpression): string => {
      switch (expression._tag) {
        case "field":
          return toNumber(dialect.jsonExtractElement(relationAlias, expression.field))
        case "mul":
          return `(${compileExpr(expression.left)} * ${compileExpr(expression.right)})`
        default:
          return assertUnreachable(expression)
      }
    }
    const factorCaseExpr = (unitExpr: string, toBase: string, factors: Readonly<Record<string, number>>) => {
      const entries = Object.entries(factors).filter(([, factor]) => Number.isFinite(factor))
      const cases = entries.map(([unit, factor]) => ` WHEN ${sqlStringLiteral(unit)} THEN ${factor}`).join("")
      return `CASE ${unitExpr} WHEN ${sqlStringLiteral(toBase)} THEN 1${cases} ELSE NULL END`
    }
    const whereClause = () =>
      computed.filter.length > 0
        ? ` WHERE ${print(computed.filter, computed.path, false)}`
        : ""
    const boolExpr = (sqlExpr: string) =>
      dialect.jsonColumnType === "JSON"
        ? `CASE WHEN ${sqlExpr} THEN 'true' ELSE 'false' END AS "${key}"`
        : `${sqlExpr} AS "${key}"`
    switch (computed._tag) {
      case "relation-count":
        return `(SELECT COUNT(1) FROM ${relationFrom}${whereClause()}) AS "${key}"`
      case "relation-any":
        return boolExpr(`EXISTS(SELECT 1 FROM ${relationFrom}${whereClause()})`)
      case "relation-every":
        // ∀x.P(x) ≡ ¬∃x.¬P(x). When no filter, no element exists that violates ⊤ → true.
        return boolExpr(
          computed.filter.length === 0
            ? `1=1`
            : `NOT EXISTS(SELECT 1 FROM ${relationFrom} WHERE NOT (${print(computed.filter, computed.path, false)}))`
        )
      case "relation-distinct-count": {
        const fieldExtract = dialect.jsonExtractElement(relationAlias, computed.field)
        return `(SELECT COUNT(DISTINCT ${fieldExtract}) FROM ${relationFrom}${whereClause()}) AS "${key}"`
      }
      case "relation-sum": {
        const fieldExtract = dialect.jsonExtractElement(relationAlias, computed.field)
        return `(SELECT COALESCE(SUM(${toNumber(fieldExtract)}), 0) FROM ${relationFrom}${whereClause()}) AS "${key}"`
      }
      case "relation-sum-expr": {
        const expression = compileExpr(computed.expression)
        return `(SELECT COALESCE(SUM(${expression}), 0) FROM ${relationFrom}${whereClause()}) AS "${key}"`
      }
      case "relation-sum-expr-by": {
        const expression = compileExpr(computed.expression)
        const unitExpr = dialect.jsonExtractElement(relationAlias, computed.unit)
        if (dialect.jsonColumnType === "JSON") {
          return `(SELECT COALESCE(json_group_array(json_object('unit', __unit, 'total', __total)), json_array()) FROM (SELECT ${unitExpr} AS __unit, COALESCE(SUM(${expression}), 0) AS __total FROM ${relationFrom}${whereClause()} GROUP BY ${unitExpr})) AS "${key}"`
        }
        return `(SELECT COALESCE(jsonb_agg(jsonb_build_object('unit', __unit, 'total', __total)), '[]'::jsonb) FROM (SELECT ${unitExpr} AS __unit, COALESCE(SUM(${expression}), 0) AS __total FROM ${relationFrom}${whereClause()} GROUP BY ${unitExpr}) __grouped) AS "${key}"`
      }
      case "relation-sum-expr-normalized": {
        const expression = compileExpr(computed.expression)
        const unitExpr = dialect.jsonExtractElement(relationAlias, computed.unit)
        const factorExpr = factorCaseExpr(unitExpr, computed.toBase, computed.factors)
        return `(SELECT COALESCE(SUM((${expression}) * (${factorExpr})), 0) FROM ${relationFrom}${whereClause()}) AS "${key}"`
      }
      case "relation-collect": {
        const fieldExtract = dialect.jsonExtractElement(relationAlias, computed.field)
        if (dialect.jsonColumnType === "JSON") {
          // sqlite: json_group_array does not accept DISTINCT; emulate via inner DISTINCT subquery
          if (computed.distinct) {
            return `(SELECT COALESCE(json_group_array(__v), json_array()) FROM (SELECT DISTINCT ${fieldExtract} AS __v FROM ${relationFrom}${whereClause()})) AS "${key}"`
          }
          return `(SELECT COALESCE(json_group_array(${fieldExtract}), json_array()) FROM ${relationFrom}${whereClause()}) AS "${key}"`
        }
        const aggArg = computed.distinct ? `DISTINCT ${fieldExtract}` : fieldExtract
        return `(SELECT COALESCE(jsonb_agg(${aggArg}), '[]'::jsonb) FROM ${relationFrom}${whereClause()}) AS "${key}"`
      }
      default:
        return assertUnreachable(computed)
    }
  }

  const getSelectExpr = (): string => {
    if (!select) return "id, _etag, data"
    const fields = select.map((s) => {
      if (typeof s === "string") {
        if (s === idKey || s === "id") return `id`
        if (s === "_etag") return `_etag`
        return `${dialect.jsonExtractJson(s)} AS "${s}"`
      }
      if ("computed" in s) {
        return computedSelectExpr(s.key, s.computed)
      }
      return `${dialect.jsonExtractJson(s.key)} AS "${s.key}"`
    })
    return fields.join(", ")
  }

  // Order matters: projection params must be emitted BEFORE user-filter
  // params so positional `?` placeholders in SQLite match `params[]` order.
  const selectExpr = getSelectExpr()

  const namespaceClause = namespace !== undefined
    ? `_namespace = ${addParam(namespace)}`
    : ""
  const userWhere = filter.length
    ? print([{ t: "where-scope", result: filter, relation: "some" }], null, false)
    : ""
  const whereClause = namespaceClause && userWhere
    ? `WHERE ${namespaceClause} AND ${userWhere}`
    : namespaceClause
    ? `WHERE ${namespaceClause}`
    : userWhere
    ? `WHERE ${userWhere}`
    : ""

  const orderClause = order
    ? `ORDER BY ${order.map((_) => `${fieldExpr(_.key)} ${_.direction}`).join(", ")}`
    : ""

  const limitClause = limit !== undefined || skip !== undefined
    ? `LIMIT ${addParam(limit ?? 999999)} OFFSET ${addParam(skip ?? 0)}`
    : ""

  const sql = `SELECT ${selectExpr} FROM "${tableName}" ${whereClause} ${orderClause} ${limitClause}`.trim()

  return { sql, params }
}
