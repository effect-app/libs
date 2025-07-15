/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Array, Option } from "effect-app"
import { assertUnreachable, get } from "effect-app/utils"
import type { FilterR, FilterResult } from "../Model/filter/filterApi.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { Filter } from "./service.js"
import { compare, greaterThan, greaterThanExclusive, lowerThan, lowerThanExclusive } from "./utils.js"

const vAsArr = (v: string) => v as unknown as any[]

const filterStatement = (x: any, p: FilterR) => {
  const k = get(x, p.path)
  switch (p.op) {
    case "in":
      return p.value.includes(k)
    case "notIn":
      return !p.value.includes(k)
    case "lt":
      return lowerThan(k, p.value)
    case "lte":
      return lowerThanExclusive(k, p.value)
    case "gt":
      return greaterThan(k, p.value)
    case "gte":
      return greaterThanExclusive(k, p.value)
    case "includes":
      return (k as Array<string>).includes(p.value)
    case "notIncludes":
      return !(k as Array<string>).includes(p.value)
    case "includes-any":
      return (vAsArr(p.value)).some((_) => (k as Array<string>)?.includes(_))
    case "notIncludes-any":
      return !(vAsArr(p.value)).some((_) => (k as Array<string>)?.includes(_))
    case "includes-all":
      return (vAsArr(p.value)).every((_) => (k as Array<string>)?.includes(_))
    case "notIncludes-all":
      return !(vAsArr(p.value)).every((_) => (k as Array<string>)?.includes(_))
    case "contains":
      return (k as string).toLowerCase().includes(p.value.toLowerCase())
    case "endsWith":
      return (k as string).toLowerCase().endsWith(p.value.toLowerCase())
    case "startsWith":
      return (k as string).toLowerCase().startsWith(p.value.toLowerCase())
    case "notContains":
      return !(k as string).toLowerCase().includes(p.value.toLowerCase())
    case "notEndsWith":
      return !(k as string).toLowerCase().endsWith(p.value.toLowerCase())
    case "notStartsWith":
      return !(k as string).toLowerCase().startsWith(p.value.toLowerCase())
    case "neq":
      return !compare(k, p.value)
    case "eq":
    case undefined:
      return compare(k, p.value)
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
  isRelation: string | null = null
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
        const rel = isRelationCheck(e.result, isRelation)
        if (rel) {
          const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
          s += isRelation
            ? ` || (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, rel)}\n${printN(l)})`
            : ` || (\n${printN(l + 1)}sut.${rel}.${e.relation}(el => ${
              codeFilter3__(e.result, sut, statements, rel)
            })\n${printN(l)})`
        } else {
          s += ` || (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements)}\n${printN(l)})`
        }
        --l
        break
      }
      case "and-scope": {
        ++l
        const rel = isRelationCheck(e.result, isRelation)
        if (rel) {
          const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
          s += isRelation
            ? ` && (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, rel)}\n${printN(l)})`
            : ` && (\n${printN(l + 1)}sut.${rel}.${e.relation}(el => ${
              codeFilter3__(e.result, sut, statements, rel)
            })\n${printN(l)})`
        } else {
          s += ` && (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements)}\n${printN(l)})`
        }
        --l

        break
      }
      case "where-scope": {
        // ;++l
        const rel = isRelationCheck(e.result, isRelation)
        if (rel) {
          const rel = (e.result[0]! as { path: string }).path.split(".-1.")[0]
          s += isRelation
            ? `(\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, rel)}\n${printN(l)})`
            : `(\n${printN(l + 1)}sut.${rel}.${e.relation}(el => ${codeFilter3__(e.result, sut, statements, rel)})\n${
              printN(l)
            })`
        } else {
          s += `(\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements)}\n${printN(l)})`
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
  const s = codeFilter3__([{ t: "where-scope", result: state, relation: "some" }], sut, statements)
  return eval(s)
}

export function codeFilter<E extends FieldValues, NE extends E>(filter: Filter) {
  return (x: E) => codeFilter3_(filter, x) ? Option.some(x as unknown as NE) : Option.none()
}
