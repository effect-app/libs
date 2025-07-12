/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Array, Option } from "effect-app"
import { assertUnreachable, get } from "effect-app/utils"
import type { FilterR, FilterResult } from "../Model/filter/filterApi.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { Filter } from "./service.js"
import { compare, greaterThan, greaterThanExclusive, lowerThan, lowerThanExclusive } from "./utils.js"

const vAsArr = (v: string) => v as unknown as any[]

export const codeFilterStatement = <E>(p: FilterR, x: E, isMulti: boolean) => {
  // const isMulti = p.path.includes(".-1.")
  if (isMulti) {
    return (x: any) => {
      const k = get(x, p.path.split(".-1.").slice(1).join(".-1."))
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
  }
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
      // TODO: array checks using some/every should happen outside, not here.
      return p.path.includes(".-1.")
        ? (get(x, p.path.split(".-1.")[0]) as any[])
          // TODO: some vs every
          .some((_) => !compare(get(_, p.path.split(".-1.")[1]!), p.value))
        : !compare(k, p.value)
    case "eq":
    case undefined:
      // TODO: array checks using some/every should happen outside, not here.
      return p.path.includes(".-1.")
        ? (get(x, p.path.split(".-1.")[0]) as any[])
          // TODO: some vs every
          .some((_) => compare(get(_, p.path.split(".-1.")[1]!), p.value))
        : compare(k, p.value)
    default: {
      return assertUnreachable(p.op)
    }
  }
}

export const codeFilter3 = <E>(state: readonly FilterResult[]) => (sut: E) => codeFilter3_(state, sut)
const codeFilter3__ = <E>(state: readonly FilterResult[], sut: E, statements: any[], isMulti: boolean): string => {
  let s = ""
  let l = 0
  const printN = (n: number) => {
    return n === 0 ? "" : Array.range(1, n).map(() => "  ").join("")
  }
  // TODO: path str updates

  const process = (e: FilterR) => codeFilterStatement(e, sut, isMulti)
  const statement = () =>
    isMulti ? `statements[${statements.length - 1}]()(el)` : `statements[${statements.length - 1}]()`
  for (const e of state) {
    switch (e.t) {
      case "where": {
        statements.push(() => process(e))
        s += statement()
        break
      }
      case "or":
        statements.push(() => process(e))
        s += " || " + statement()
        break
      case "and":
        statements.push(() => process(e))
        s += " && " + statement()
        break
      case "or-scope": {
        ++l
        if (e.result[0]?.t === "where" && e.result[0].path.includes(".-1.")) {
          const rel = e.result[0].path.split(".-1.")[0]
          s += ` || (\n${printN(l + 1)}sut.${rel}.some(el => ${codeFilter3__(e.result, sut, statements, true)})\n${
            printN(l)
          })`
        } else {
          s += ` || (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, true)}\n${printN(l)})`
        }
        --l
        break
      }
      case "and-scope": {
        ++l
        if (e.result[0]?.t === "where" && e.result[0].path.includes(".-1.")) {
          const rel = e.result[0].path.split(".-1.")[0]
          s += ` && (\n${printN(l + 1)}sut.${rel}.some(el => ${codeFilter3__(e.result, sut, statements, true)})\n${
            printN(l)
          })`
        } else {
          s += ` && (\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, true)}\n${printN(l)})`
        }
        --l

        break
      }
      case "where-scope": {
        // ;++l
        if (e.result[0]?.t === "where" && e.result[0].path.includes(".-1.")) {
          const rel = e.result[0].path.split(".-1.")[0]
          s += `(\n${printN(l + 1)}sut.${rel}.some(el => ${codeFilter3__(e.result, sut, statements, true)})\n${
            printN(l)
          })`
        } else {
          s += `(\n${printN(l + 1)}${codeFilter3__(e.result, sut, statements, true)}\n${printN(l)})`
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
  const s = codeFilter3__(state, sut, statements, false)
  return eval(s)
}

export function codeFilter<E extends FieldValues, NE extends E>(filter: Filter) {
  return (x: E) => codeFilter3_(filter, x) ? Option.some(x as unknown as NE) : Option.none()
}
