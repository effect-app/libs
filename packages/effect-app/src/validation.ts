import type { Predicate } from "./Function.ts"

export const all_ = <T>(v: T, ...a: Predicate<T>[]) => !a.some((x) => !x(v))
export const all = <T>(...a: Predicate<T>[]) => (v: T) => all_(v, ...a)

export const maxN = (max: number) => (v: number) => v <= max
export const minN = (min: number) => (v: number) => v >= min

export const max = (max: number) => {
  const f = maxN(max)
  return (v: { length: number }) => f(v.length)
}
export const min = (min: number) => {
  const f = minN(min)
  return (v: { length: number }) => f(v.length)
}

export * from "./validation/validators.ts"
