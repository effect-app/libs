/**
 * Own-property define that shadows getter-only prototype fields such as
 * Effect 4 `Schema.make`. `Object.assign` uses [[Set]] and cannot.
 */
export const defineOwn = (target: object, key: PropertyKey, value: unknown) => {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  })
}

const assignOwn = <T extends object>(target: T, source: object): T => {
  for (const key of Reflect.ownKeys(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key)
    if (!desc?.enumerable) continue
    defineOwn(target, key, (source as Record<PropertyKey, unknown>)[key])
  }
  return target
}

export const extend = <T extends {}, X extends {}>(a: T, ext: X) => {
  assignOwn(a, ext)
  return a as T & X
}

export const extendM = <T extends {}, X extends {}>(a: T, ext: (a: T) => X) => extend(a, ext(a))
