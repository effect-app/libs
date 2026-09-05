/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as Array from "effect-app/Array"
import type { FilterR, FilterResult } from "effect-app/Model/filter/filterApi"
import type { FieldValues } from "effect-app/Model/filter/types"
import * as Option from "effect-app/Option"
import type { Filter } from "effect-app/Store"
import { assertUnreachable } from "effect-app/utils"
import { compare, get, greaterThan, greaterThanExclusive, lowerThan, lowerThanExclusive, toJsonQueryValue } from "./utils.ts"

const vAsArr = (v: unknown) => toJsonQueryValue(v) as any[]

const mapEntries = (value: unknown): readonly [unknown, unknown][] => {
  const json = toJsonQueryValue(value)
  if (!Array.isArray(json)) return []
  return json.filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
}

const pairEq = (entry: readonly [unknown, unknown], pair: unknown) => {
  const json = toJsonQueryValue(pair)
  return Array.isArray(json) && json.length >= 2 && compare(entry[0], json[0]) && compare(entry[1], json[1])
}

const filterStatement = (x: any, p: FilterR) => {
  const k = toJsonQueryValue(get(x, p.path))
  const v = toJsonQueryValue(p.value)
  switch (p.op) {
    case "in":
      return (v as unknown[]).includes(k)
    case "notIn":
      return !(v as unknown[]).includes(k)
    case "lt":
      return lowerThan(k as any, v as any)
    case "lte":
      return lowerThanExclusive(k as any, v as any)
    case "gt":
      return greaterThan(k as any, v as any)
    case "gte":
      return greaterThanExclusive(k as any, v as any)
    case "includes":
      return (k as Array<unknown>).includes(v)
    case "notIncludes":
      return !(k as Array<unknown>).includes(v)
    case "includes-any":
      return (vAsArr(p.value)).some((_) => (k as Array<unknown>)?.includes(_))
    case "notIncludes-any":
      return !(vAsArr(p.value)).some((_) => (k as Array<unknown>)?.includes(_))
    case "includes-all":
      return (vAsArr(p.value)).every((_) => (k as Array<unknown>)?.includes(_))
    case "notIncludes-all":
      return !(vAsArr(p.value)).every((_) => (k as Array<unknown>)?.includes(_))
    case "hasKey":
      return mapEntries(k).some(([key]) => compare(key, v))
    case "notHasKey":
      return !mapEntries(k).some(([key]) => compare(key, v))
    case "hasValue":
      return mapEntries(k).some(([, val]) => compare(val, v))
    case "notHasValue":
      return !mapEntries(k).some(([, val]) => compare(val, v))
    case "hasKeyValue":
      return mapEntries(k).some((entry) => pairEq(entry, v))
    case "notHasKeyValue":
      return !mapEntries(k).some((entry) => pairEq(entry, v))
    case "hasKey-any":
      return vAsArr(p.value).some((key) => mapEntries(k).some(([k0]) => compare(k0, key)))
    case "notHasKey-any":
      return !vAsArr(p.value).some((key) => mapEntries(k).some(([k0]) => compare(k0, key)))
    case "hasKey-all":
      return vAsArr(p.value).every((key) => mapEntries(k).some(([k0]) => compare(k0, key)))
    case "notHasKey-all":
      return !vAsArr(p.value).every((key) => mapEntries(k).some(([k0]) => compare(k0, key)))
    case "hasValue-any":
      return vAsArr(p.value).some((val) => mapEntries(k).some(([, v0]) => compare(v0, val)))
    case "notHasValue-any":
      return !vAsArr(p.value).some((val) => mapEntries(k).some(([, v0]) => compare(v0, val)))
    case "hasValue-all":
      return vAsArr(p.value).every((val) => mapEntries(k).some(([, v0]) => compare(v0, val)))
    case "notHasValue-all":
      return !vAsArr(p.value).every((val) => mapEntries(k).some(([, v0]) => compare(v0, val)))
    case "hasKeyValue-any":
      return vAsArr(p.value).some((pair) => mapEntries(k).some((entry) => pairEq(entry, pair)))
    case "notHasKeyValue-any":
      return !vAsArr(p.value).some((pair) => mapEntries(k).some((entry) => pairEq(entry, pair)))
    case "hasKeyValue-all":
      return vAsArr(p.value).every((pair) => mapEntries(k).some((entry) => pairEq(entry, pair)))
    case "notHasKeyValue-all":
      return !vAsArr(p.value).every((pair) => mapEntries(k).some((entry) => pairEq(entry, pair)))
    case "contains":
      return (k as string).toLowerCase().includes((v as string).toLowerCase())
    case "endsWith":
      return (k as string).toLowerCase().endsWith((v as string).toLowerCase())
    case "startsWith":
      return (k as string).toLowerCase().startsWith((v as string).toLowerCase())
    case "notContains":
      return !(k as string).toLowerCase().includes((v as string).toLowerCase())
    case "notEndsWith":
      return !(k as string).toLowerCase().endsWith((v as string).toLowerCase())
    case "notStartsWith":
      return !(k as string).toLowerCase().startsWith((v as string).toLowerCase())
    case "neq":
      return !compare(k, v)
    case "eq":
    case undefined:
      return compare(k, v)
    default: {
      return assertUnreachable(p.op)
    }
  }
}

export const codeFilterStatement = <E>(p: FilterR, x: E) => filterStatement(x, p)

// TODO: still prevent mixing relation checks with non-relation checks in the same filter scope
// right now we ignore scoped combinations, because they allow us to scope relation checks too.
// probably best to create a separate keyword and dsl for relation checks, so we can remove all the special casing alltogether..
export const isRelationCheck = (f: readonly FilterResult[], isRelation: string | null) => {
  const withPath = f.filter((_) => "path" in _)
  if (withPath.length && withPath.every((_) => "path" in _ && _.path.includes(".-1."))) {
    const first = withPath[0] as { path: string }
    const rel = first.path.split(".-1.")[0]
    if (isRelation && rel !== isRelation) {
      throw new Error(`expected ${isRelation} relation but found ${rel}`)
    }
    if (!f.filter((_) => "path" in _).every((_) => "path" in _ && _.path.startsWith(rel + ".-1."))) {
      throw new Error(
        `Cannot mix relation checks of different props, expected all to be "${rel}"`
      )
    }
    return rel
  }
  if (f.some((_) => "path" in _ && _.path.includes(".-1."))) {
    throw new Error(
      "Cannot mix relation checks with non-relation checks in the same filter scope. create a separate one"
    )
  }

  return false
}

export const codeFilter3 = <E>(state: readonly FilterResult[]) => (sut: E) => codeFilter3_(state, sut)
const codeFilter3__ = <E>(
  state: readonly FilterResult[],
  sut: E,
  statements: any[],
  isRelation: string | null,
  every: boolean
): string => {
  let s = ""
  let l = 0
  const printN = (n: number) => {
    return n === 0 ? "" : Array.range(1, n).map(() => "  ").join("")
  }
  // TODO: path str updates

  const process = isRelation
    ? (e: FilterR, el: any) =>
      codeFilterStatement({ ...e, path: e.path.split(".-1.").slice(1).join(".-1.") }, el ?? sut)
    : (e: FilterR, el: any) => codeFilterStatement(e, el ?? sut)
  const statement = isRelation
    ? () => `statements[${statements.length - 1}](el)`
    : () => `statements[${statements.length - 1}]()`
  for (const e of state) {
    switch (e.t) {
      case "where": {
        statements.push((el: any) => process(e, el))
        s += statement()
        break
      }
      case "or":
        statements.push((el: any) => process(e, el))
        s += " || " + statement()
        break
      case "and":
        statements.push((el: any) => process(e, el))
        s += " && " + statement()
        break
      case "or-scope": {
        ++l
        if (!every) every = e.relation === "every"
        const rel = isRelationCheck(e.result, isRelation)
        if (rel) {
          const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
          s += isRelation
            ? ` || (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, rel, every)}\n${printN(l)})`
            : ` || (\n${printN(l + 1)}sut.${rel}.${every ? "every" : "some"}(el => ${
              codeFilter3__(e.result, sut, statements, rel, every)
            })\n${printN(l)})`
        } else {
          s += ` || (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, null, every)}\n${printN(l)})`
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
            ? ` && (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, rel, every)}\n${printN(l)})`
            : ` && (\n${printN(l + 1)}sut.${rel}.${every ? "every" : "some"}(el => ${
              codeFilter3__(e.result, sut, statements, rel, every)
            })\n${printN(l)})`
        } else {
          s += ` && (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, null, every)}\n${printN(l)})`
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
            ? `(\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, rel, every)}\n${printN(l)})`
            : `(\n${printN(l + 1)}sut.${rel}.${every ? "every" : "some"}(el => ${
              codeFilter3__(e.result, sut, statements, rel, every)
            })\n${printN(l)})`
        } else {
          s += `(\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, null, every)}\n${printN(l)})`
        }
        // ;--l
        break
      }
    }
  }
  return s
}

export const codeFilter3_ = <E>(state: readonly FilterResult[], sut: E): boolean => {
  const statements: any[] = [] // must be defined here to be used by eval.
  // always put everything inside a root scope.
  const s = codeFilter3__([{ t: "where-scope", result: state, relation: "some" }], sut, statements, null, false)
  // oxlint-disable-next-line no-eval
  return eval(s)
}

export function codeFilter<E extends FieldValues, NE extends E>(filter: Filter) {
  return (x: E) => codeFilter3_(filter, x) ? Option.some(x as unknown as NE) : Option.none()
}
