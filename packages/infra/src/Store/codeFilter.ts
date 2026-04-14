/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Array, Option } from "effect-app"
import { assertUnreachable, get } from "effect-app/utils"
import type { FilterR, FilterResult } from "../Model/filter/filterApi.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { Filter } from "./service.js"
import { compare, greaterThan, greaterThanExclusive, lowerThan, lowerThanExclusive } from "./utils.js"

const vAsArr = (v: any) => v as any[]

const normalizeValue = (v: unknown) => v instanceof globalThis.Date ? v.toISOString() : v

const filterStatement = (x: any, p: FilterR) => {
  const k = normalizeValue(get(x, p.path)) as any
  const v = normalizeValue(p.value) as any
  switch (p.op) {
    case "in":
      return (v as any[]).includes(k)
    case "notIn":
      return !(v as any[]).includes(k)
    case "lt":
      return lowerThan(k, v)
    case "lte":
      return lowerThanExclusive(k, v)
    case "gt":
      return greaterThan(k, v)
    case "gte":
      return greaterThanExclusive(k, v)
    case "includes":
      return (k as Array<string>).includes(v as string)
    case "notIncludes":
      return !(k as Array<string>).includes(v as string)
    case "includes-any":
      return (vAsArr(v as string)).some((_) => (k as Array<string>)?.includes(_))
    case "notIncludes-any":
      return !(vAsArr(v as string)).some((_) => (k as Array<string>)?.includes(_))
    case "includes-all":
      return (vAsArr(v as string)).every((_) => (k as Array<string>)?.includes(_))
    case "notIncludes-all":
      return !(vAsArr(v as string)).every((_) => (k as Array<string>)?.includes(_))
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
  return eval(s)
}

export function codeFilter<E extends FieldValues, NE extends E>(filter: Filter) {
  return (x: E) => codeFilter3_(filter, x) ? Option.some(x as unknown as NE) : Option.none()
}
