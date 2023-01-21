/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dictionary } from "./Dictionary.js"
import * as D from "./Dictionary.js"

export * from "./utils/extend.js"

export const unsafeRight = <E, A>(ei: Either<E, A>) => {
  if (ei.isLeft()) {
    console.error(ei.left)
    throw ei.left
  }
  return ei.right
}

export const unsafeSome = (makeErrorMessage: () => string) =>
  <A>(o: Opt<A>) => {
    if (o.isNone()) {
      throw new Error(makeErrorMessage())
    }
    return o.value
  }

export function toString(v: unknown) {
  return `${v}`
}

export const isTruthy = <T>(item: T | null | undefined): item is T => Boolean(item)
export const typedKeysOf = <T extends {}>(obj: T) => Object.keys(obj) as (keyof T)[]
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
export const typedValuesOf = <T extends {}>(obj: T) => Object.values(obj) as ValueOf<T>[]
type ValueOf<T> = T[keyof T]

export type Constructor<T = any> = { new(...args: any[]): T }
export type ThenArg<T> = T extends Promise<infer U> ? U
  : T extends (...args: any[]) => Promise<infer V> ? V
  : T

export function dropUndefined<A>(
  input: Dictionary<A | undefined>
): Dictionary<A> {
  const newR = pipe(
    input,
    D.filter((x): x is A => x !== undefined)
  )
  return newR
}

type GetTag<T> = T extends { _tag: infer K } ? K : never
export const isOfType = <T extends { _tag: string }>(tag: GetTag<T>) => (e: { _tag: string }): e is T => e._tag === tag

export function capitalize<T extends string>(string: T): Capitalize<T> {
  return (string.charAt(0).toUpperCase() + string.slice(1)) as Capitalize<T>
}

export function uncapitalize<T extends string>(string: T): Uncapitalize<T> {
  return (string.charAt(0).toLowerCase() + string.slice(1)) as Uncapitalize<T>
}

export function pretty(o: unknown): string {
  return JSON.stringify(o, undefined, 2) ?? "undefined"
}

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void ? I
  : never

export type EnforceNonEmptyRecord<R> = keyof R extends never ? never : R

export function intersect<AS extends unknown[] & { 0: unknown }>(
  ...as: AS
): UnionToIntersection<{ [k in keyof AS]: AS[k] }[number]> {
  return as.reduce((a: any, b: any) => ({ ...a, ...b })) as any
}

export const pattern: <N extends string>(
  n: N
) => {
  <
    X extends { [k in N]: string },
    K extends {
      [k in X[N]]: (
        _: Extract<X, { [_tag in N]: k }>,
        __: Extract<X, { [_tag in N]: k }>
      ) => any
    }
  >(
    _: K
  ): (m: X) => ReturnType<K[keyof K]>
  <
    X extends { [k in N]: string },
    K extends Partial<
      {
        [k in X[N]]: (
          _: Extract<X, { [_tag in N]: k }>,
          __: Extract<X, { [_tag in N]: k }>
        ) => any
      }
    >,
    H
  >(
    _:
      & K
      & {
        [k in X[N]]?: (
          _: Extract<X, { [_tag in N]: k }>,
          __: Extract<X, { [_tag in N]: k }>
        ) => any
      },
    __: (_: Exclude<X, { _tag: keyof K }>, __: Exclude<X, { _tag: keyof K }>) => H
  ): (m: X) => { [k in keyof K]: ReturnType<NonNullable<K[k]>> }[keyof K] | H
} = n =>
  ((_: any, d: any) =>
    (m: any) => {
      return (_[m[n]] ? _[m[n]](m, m) : d(m, m))
    }) as any

export const matchTag = pattern("_tag")

export const pattern_: <N extends string>(
  n: N
) => {
  <
    X extends { [k in N]: string },
    K extends {
      [k in X[N]]: (
        _: Extract<X, { [_tag in N]: k }>,
        __: Extract<X, { [_tag in N]: k }>
      ) => any
    }
  >(
    m: X,
    _: K
  ): ReturnType<K[keyof K]>
  <
    X extends { [k in N]: string },
    K extends Partial<
      {
        [k in X[N]]: (
          _: Extract<X, { [_tag in N]: k }>,
          __: Extract<X, { [_tag in N]: k }>
        ) => any
      }
    >,
    H
  >(
    m: X,
    _:
      & K
      & {
        [k in X[N]]?: (
          _: Extract<X, { [_tag in N]: k }>,
          __: Extract<X, { [_tag in N]: k }>
        ) => any
      },
    __: (_: Exclude<X, { _tag: keyof K }>, __: Exclude<X, { _tag: keyof K }>) => H
  ): { [k in keyof K]: ReturnType<NonNullable<K[k]>> }[keyof K] | H
} = n =>
  ((m: any, _: any, d: any) => {
    return (_[m[n]] ? _[m[n]](m, m) : d(m, m))
  }) as any

export const matchTag_ = pattern_("_tag")

export const patternFor: <N extends string>(
  n: N
) => <X extends { [k in N]: string }>() => {
  <
    K extends {
      [k in X[N]]: (
        _: Extract<X, { [_tag in N]: k }>,
        __: Extract<X, { [_tag in N]: k }>
      ) => any
    }
  >(
    _: K
  ): (m: X) => ReturnType<K[keyof K]>
  <
    K extends Partial<
      {
        [k in X[N]]: (
          _: Extract<X, { [_tag in N]: k }>,
          __: Extract<X, { [_tag in N]: k }>
        ) => any
      }
    >,
    H
  >(
    _:
      & K
      & {
        [k in X[N]]?: (
          _: Extract<X, { [_tag in N]: k }>,
          __: Extract<X, { [_tag in N]: k }>
        ) => any
      },
    __: (_: Exclude<X, { _tag: keyof K }>, __: Exclude<X, { _tag: keyof K }>) => H
  ): (m: X) => { [k in keyof K]: ReturnType<NonNullable<K[k]>> }[keyof K] | H
} = n =>
  () =>
    ((_: any, d: any) =>
      (m: any) => {
        return (_[m[n]] ? _[m[n]](m, m) : d(m, m))
      }) as any

export const matchTagFor = patternFor("_tag")

export type IsEqualTo<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2 ? true
  : false

export const unifyIndex = Symbol()
export type unifyIndex = typeof unifyIndex

// @ts-expect-error abc
export interface UnifiableIndexed<X> {}
export type UnifiableIndexedURI = keyof UnifiableIndexed<any>

export interface Unifiable<X> {
  // Sync: [X] extends [Sync<infer R, infer E, infer A>] ? Sync<R, E, A> : never
  // Effect: [X] extends [Effect<infer R, infer E, infer A>]
  //   ? [X] extends [Sync<infer R, infer E, infer A>]
  //     ? never
  //     : Effect<R, E, A>
  //   : never
  Unify: [X] extends [{ readonly [unifyIndex]: infer K }] ? K extends UnifiableIndexedURI ? UnifiableIndexed<X>[K]
  : never
    : never
}

export type Unify<X> = Unifiable<X>[keyof Unifiable<any>] extends never ? X
  : Unifiable<X>[keyof Unifiable<any>]

// forked from https://github.com/Alorel/typescript-lazy-get-decorator

type DecoratorReturn = PropertyDescriptor | NewDescriptor

function decorateNew(
  inp: NewDescriptor,
  setProto: boolean,
  makeNonConfigurable: boolean,
  resultSelector: ResultSelectorFn
): NewDescriptor {
  const out: NewDescriptor = Object.assign({}, inp)
  if (out.descriptor) {
    out.descriptor = Object.assign({}, out.descriptor)
  }
  const actualDesc: PropertyDescriptor = <any> (
    out.descriptor || /* istanbul ignore next */ out
  )

  const originalMethod = validateAndExtractMethodFromDescriptor(actualDesc)
  const isStatic = inp.placement === "static"

  actualDesc.get = function(this: any): any {
    return getterCommon(
      isStatic ? this : Object.getPrototypeOf(this),
      out.key,
      isStatic,
      !!actualDesc.enumerable,
      originalMethod,
      this,
      // eslint-disable-next-line prefer-rest-params
      arguments,
      setProto,
      makeNonConfigurable,
      resultSelector
    )
  }

  return out
}

function decorateLegacy(
  target: any,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
  setProto: boolean,
  makeNonConfigurable: boolean,
  // tslint:enable:bool-param-default
  resultSelector: ResultSelectorFn
): PropertyDescriptor {
  /* istanbul ignore if */
  if (!descriptor) {
    descriptor = <any> Object.getOwnPropertyDescriptor(target, key)
    if (!descriptor) {
      const e = new Error("@LazyGetter is unable to determine the property descriptor")
      ;(<any> e).$target = target
      ;(<any> e).$key = key
      throw e
    }
  }

  const originalMethod = validateAndExtractMethodFromDescriptor(descriptor)

  return Object.assign({}, descriptor, {
    get(this: any): any {
      return getterCommon(
        target,
        key,
        Object.getPrototypeOf(target) === Function.prototype,
        !!descriptor.enumerable,
        originalMethod,
        this,
        // eslint-disable-next-line prefer-rest-params
        arguments,
        setProto,
        makeNonConfigurable,
        resultSelector
      )
    }
  })
}

/** Signifies that the modified property descriptor can be reset to its original state */
interface ResettableDescriptor {
  /**
   * Restore the property descriptor on the given class instance or prototype and re-apply the lazy getter.
   * @param on The class instance or prototype
   */
  reset(on: any): void
}

/** ES7 proposal descriptor, tweaked for Babel */
interface NewDescriptor extends PropertyDescriptor {
  descriptor?: PropertyDescriptor

  key: PropertyKey

  kind: string

  placement: string
}

/** A filter function that must return true for the value to cached */
export type ResultSelectorFn = (v: any) => boolean

function defaultFilter(): boolean {
  return true
}

function validateAndExtractMethodFromDescriptor(desc: PropertyDescriptor): Function {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalMethod = <Function> desc.get

  if (!originalMethod) {
    throw new Error("@LazyGetter can only decorate getters!")
  } else if (!desc.configurable) {
    throw new Error("@LazyGetter target must be configurable")
  }

  return originalMethod
}

function getterCommon( // tslint:disable-line:parameters-max-number
  target: any,
  key: PropertyKey,
  isStatic: boolean,
  enumerable: boolean,
  originalMethod: Function,
  thisArg: any,
  args: IArguments,
  setProto: boolean,
  makeNonConfigurable: boolean,
  resultSelector: ResultSelectorFn
): any {
  const value = originalMethod.apply(thisArg, <any> args)

  if (resultSelector(value)) {
    const newDescriptor: PropertyDescriptor = {
      configurable: !makeNonConfigurable,
      enumerable,
      value
    }

    if (isStatic || setProto) {
      Object.defineProperty(target, key, newDescriptor)
    }

    if (!isStatic) {
      Object.defineProperty(thisArg, key, newDescriptor)
    }
  }

  return value
}

/**
 * Evaluate the getter function and cache the result
 * @param [setProto=false] Set the value on the class prototype as well. Only applies to non-static getters.
 * @param [makeNonConfigurable=false] Set to true to make the resolved property non-configurable
 * @param [resultSelector] A filter function that must return true for the value to cached
 * @return A decorator function
 */
export function LazyGetter(
  setProto = false,
  makeNonConfigurable = false,
  resultSelector: ResultSelectorFn = defaultFilter
): MethodDecorator & ResettableDescriptor {
  let desc: PropertyDescriptor
  let prop: PropertyKey
  let args: IArguments = <any> null
  let isLegacy: boolean

  function decorator(
    targetOrDesc: any,
    key: PropertyKey,
    descriptor: PropertyDescriptor
  ): DecoratorReturn {
    // eslint-disable-next-line prefer-rest-params
    args = arguments
    if (key === undefined) {
      if (typeof desc === "undefined") {
        isLegacy = false
        prop = (<NewDescriptor> targetOrDesc).key
        desc = Object.assign(
          {},
          (<NewDescriptor> targetOrDesc).descriptor ||
            /* istanbul ignore next */ targetOrDesc
        )
      }

      return decorateNew(targetOrDesc, setProto, makeNonConfigurable, resultSelector)
    } else {
      if (typeof desc === "undefined") {
        isLegacy = true
        prop = key
        desc = Object.assign(
          {},
          descriptor ||
            /* istanbul ignore next */ Object.getOwnPropertyDescriptor(
              targetOrDesc,
              key
            )
        )
      }

      return decorateLegacy(
        targetOrDesc,
        key,
        descriptor,
        setProto,
        makeNonConfigurable,
        resultSelector
      )
    }
  }

  decorator.reset = setProto
    ? thrower
    : (on: any): void => {
      if (!on) {
        throw new Error("Unable to restore descriptor on an undefined target")
      }
      if (!desc) {
        throw new Error(
          "Unable to restore descriptor. Did you remember to apply your decorator to a method?"
        )
      }
      // Restore descriptor to its original state
      Object.defineProperty(on, prop, desc)
      // eslint-disable-next-line prefer-spread
      const ret: any = decorator.apply(null, <any> args)
      Object.defineProperty(on, prop, isLegacy ? ret : ret.descriptor || ret)
    }

  return decorator
}

function thrower(): never {
  throw new Error("This decoration modifies the class prototype and cannot be reset.")
}

export type RefinementWithIndex<I, A, B extends A> = (i: I, a: A) => a is B

export type PredicateWithIndex<I, A> = (i: I, a: A) => boolean

export type Erase<R, K> = R & K extends K & infer R1 ? R1 : R

/** from ts-toolbelt, minimal port of Compute */

export type Depth = "flat" | "deep"

type Errors = Error
// | EvalError
// | RangeError
// | ReferenceError
// | SyntaxError
// | TypeError
// | URIError

type Numeric =
  // | Number
  // | BigInt // not needed
  // | Math
  Date

type Textual =
  // | String
  RegExp

type Arrays =
  // | Array<unknown>
  // | ReadonlyArray<unknown>
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
// | BigInt64Array
// | BigUint64Array

type Maps =
  // | Map<unknown, unknown>
  // | Set<unknown>
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>

type Structures =
  | ArrayBuffer
  // | SharedArrayBuffer
  // | Atomics
  | DataView
// | JSON

type Abstractions = Function | Promise<unknown> | Generator
// | GeneratorFunction

type WebAssembly = never

export type BuiltInObject =
  | Errors
  | Numeric
  | Textual
  | Arrays
  | Maps
  | Structures
  | Abstractions
  | WebAssembly

export type ComputeRaw<A> = A extends Function ? A
  : 
    & {
      [K in keyof A]: A[K]
    }
    & {}

export type ComputeFlat<A> = A extends BuiltInObject ? A
  : 
    & {
      [K in keyof A]: A[K]
    }
    & {}

export type ComputeDeep<A> = A extends BuiltInObject ? A
  : 
    & {
      [K in keyof A]: ComputeDeep<A[K]>
    }
    & {}

export type Compute<A, depth extends Depth = "deep"> = {
  flat: ComputeFlat<A>
  deep: ComputeDeep<A>
}[depth]
