/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Array, Option } from "effect-app"
import { assertUnreachable, get } from "effect-app/utils"
import type { FilterR, FilterResult } from "../Model/filter/filterApi.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { Filter } from "./service.js"
import { compare, greaterThan, greaterThanExclusive, lowerThan, lowerThanExclusive } from "./utils.js"

const vAsArr = (v: string) => v as unknown as any[]

export const codeFilterStatement = <E>(p: FilterR, x: E) => {
  const oneOrSome = (predicate: (k: any, val: any) => boolean) =>
    p.path.includes(".-1.")
      ? (get(x, p.path.split(".-1.")[0]) as any[])
        // TODO: all vs some
        .some((_) => !predicate(get(_, p.path.split(".-1.")[1]!), p.value))
      : !predicate(get(x, p.path), p.value)
  switch (p.op) {
    case "in":
      return oneOrSome((k, v) => v.includes(k))
    case "notIn":
      return oneOrSome((k, v) => !v.includes(k))
    case "lt":
      return oneOrSome((k, v) => lowerThan(k, v))
    case "lte":
      return oneOrSome((k, v) => lowerThanExclusive(k, v))
    case "gt":
      return oneOrSome((k, v) => greaterThan(k, v))
    case "gte":
      return oneOrSome((k, v) => greaterThanExclusive(k, v))
    case "includes":
      return oneOrSome((k, v) => (k as Array<string>).includes(v))
    case "notIncludes":
      return oneOrSome((k, v) => !(k as Array<string>).includes(v))
    case "includes-any":
      return oneOrSome((k, v) => (vAsArr(v)).some((_) => (k as Array<string>)?.includes(_)))
    case "notIncludes-any":
      return oneOrSome((k, v) => !(vAsArr(v)).some((_) => (k as Array<string>)?.includes(_)))
    case "includes-all":
      return oneOrSome((k, v) => (vAsArr(v)).every((_) => (k as Array<string>)?.includes(_)))
    case "notIncludes-all":
      return oneOrSome((k, v) => !(vAsArr(v)).every((_) => (k as Array<string>)?.includes(_)))
    case "contains":
      return oneOrSome((k, v) => (k as string).toLowerCase().includes(v.toLowerCase()))
    case "endsWith":
      return oneOrSome((k, v) => (k as string).toLowerCase().endsWith(v.toLowerCase()))
    case "startsWith":
      return oneOrSome((k, v) => (k as string).toLowerCase().startsWith(v.toLowerCase()))
    case "notContains":
      return oneOrSome((k, v) => !(k as string).toLowerCase().includes(v.toLowerCase()))
    case "notEndsWith":
      return oneOrSome((k, v) => !(k as string).toLowerCase().endsWith(v.toLowerCase()))
    case "notStartsWith":
      return oneOrSome((k, v) => !(k as string).toLowerCase().startsWith(v.toLowerCase()))
    case "neq":
      return oneOrSome((k, v) => !compare(k, v))
    case "eq":
    case undefined:
      return oneOrSome((k, v) => compare(k, v))
    default: {
      return assertUnreachable(p.op)
    }
  }
}

export const codeFilter3 = <E>(state: readonly FilterResult[]) => (sut: E) => codeFilter3_(state, sut)
const codeFilter3__ = <E>(state: readonly FilterResult[], sut: E, statements: any[]): string => {
  let s = ""
  let l = 0
  const printN = (n: number) => {
    return n === 0 ? "" : Array.range(1, n).map(() => "  ").join("")
  }
  // TODO: path str updates

  const process = (e: FilterR) => codeFilterStatement(e, sut)
  for (const e of state) {
    switch (e.t) {
      case "where":
        statements.push(() => process(e))
        s += `statements[${statements.length - 1}]()`
        break
      case "or":
        statements.push(() => process(e))
        s += " || " + `statements[${statements.length - 1}]()`
        break
      case "and":
        statements.push(() => process(e))
        s += " && " + `statements[${statements.length - 1}]()`
        break
      case "or-scope": {
        ++l
        s += ` || (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements)}\n${printN(l)})`
        --l
        break
      }
      case "and-scope": {
        ++l
        s += ` && (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements)}\n${printN(l)})`
        --l

        break
      }
      case "where-scope": {
        // ;++l
        s += `(\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements)}\n)`
        // ;--l
        break
      }
    }
  }
  return s
}

export const codeFilter3_ = <E>(state: readonly FilterResult[], sut: E): boolean => {
  const statements: any[] = [] // must be defined here to be used by eval.
  const s = codeFilter3__(state, sut, statements)
  return eval(s)
}

export function codeFilter<E extends FieldValues, NE extends E>(filter: Filter) {
  return (x: E) => codeFilter3_(filter, x) ? Option.some(x as unknown as NE) : Option.none()
}
