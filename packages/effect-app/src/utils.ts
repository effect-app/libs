/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, Option } from "effect"
import * as Either from "effect/Either"
import { dual, isFunction } from "effect/Function"
import type { GetFieldType, NumericDictionary, PropertyPath } from "lodash"
import type { Dictionary } from "./Dictionary.js"
import * as D from "./Dictionary.js"
import { identity, pipe } from "./Function.js"

// codegen:start {preset: barrel, include: ./utils/*.ts, nodir: false }
export * from "./utils/effectify.js"
export * from "./utils/extend.js"
export * from "./utils/logger.js"
// codegen:end

export const cloneTrait = Symbol.for("clone-trait")
export interface Clone {
  [cloneTrait](this: this, that: any): this
}

function get<TObject extends object, TKey extends keyof TObject>(object: TObject, path: TKey | [TKey]): TObject[TKey]
function get<TObject extends object, TKey extends keyof TObject>(
  object: TObject | null | undefined,
  path: TKey | [TKey]
): TObject[TKey] | undefined
function get<TObject extends object, TKey extends keyof TObject, TDefault>(
  object: TObject | null | undefined,
  path: TKey | [TKey],
  defaultValue: TDefault
): Exclude<TObject[TKey], undefined> | TDefault
function get<TObject extends object, TKey1 extends keyof TObject, TKey2 extends keyof TObject[TKey1]>(
  object: TObject,
  path: [TKey1, TKey2]
): TObject[TKey1][TKey2]
function get<TObject extends object, TKey1 extends keyof TObject, TKey2 extends keyof TObject[TKey1]>(
  object: TObject | null | undefined,
  path: [TKey1, TKey2]
): TObject[TKey1][TKey2] | undefined
function get<TObject extends object, TKey1 extends keyof TObject, TKey2 extends keyof TObject[TKey1], TDefault>(
  object: TObject | null | undefined,
  path: [TKey1, TKey2],
  defaultValue: TDefault
): Exclude<TObject[TKey1][TKey2], undefined> | TDefault
function get<
  TObject extends object,
  TKey1 extends keyof TObject,
  TKey2 extends keyof TObject[TKey1],
  TKey3 extends keyof TObject[TKey1][TKey2]
>(object: TObject, path: [TKey1, TKey2, TKey3]): TObject[TKey1][TKey2][TKey3]
function get<
  TObject extends object,
  TKey1 extends keyof TObject,
  TKey2 extends keyof TObject[TKey1],
  TKey3 extends keyof TObject[TKey1][TKey2]
>(object: TObject | null | undefined, path: [TKey1, TKey2, TKey3]): TObject[TKey1][TKey2][TKey3] | undefined
function get<
  TObject extends object,
  TKey1 extends keyof TObject,
  TKey2 extends keyof TObject[TKey1],
  TKey3 extends keyof TObject[TKey1][TKey2],
  TDefault
>(
  object: TObject | null | undefined,
  path: [TKey1, TKey2, TKey3],
  defaultValue: TDefault
): Exclude<TObject[TKey1][TKey2][TKey3], undefined> | TDefault
function get<
  TObject extends object,
  TKey1 extends keyof TObject,
  TKey2 extends keyof TObject[TKey1],
  TKey3 extends keyof TObject[TKey1][TKey2],
  TKey4 extends keyof TObject[TKey1][TKey2][TKey3]
>(object: TObject, path: [TKey1, TKey2, TKey3, TKey4]): TObject[TKey1][TKey2][TKey3][TKey4]
function get<
  TObject extends object,
  TKey1 extends keyof TObject,
  TKey2 extends keyof TObject[TKey1],
  TKey3 extends keyof TObject[TKey1][TKey2],
  TKey4 extends keyof TObject[TKey1][TKey2][TKey3]
>(
  object: TObject | null | undefined,
  path: [TKey1, TKey2, TKey3, TKey4]
): TObject[TKey1][TKey2][TKey3][TKey4] | undefined
function get<
  TObject extends object,
  TKey1 extends keyof TObject,
  TKey2 extends keyof TObject[TKey1],
  TKey3 extends keyof TObject[TKey1][TKey2],
  TKey4 extends keyof TObject[TKey1][TKey2][TKey3],
  TDefault
>(
  object: TObject | null | undefined,
  path: [TKey1, TKey2, TKey3, TKey4],
  defaultValue: TDefault
): Exclude<TObject[TKey1][TKey2][TKey3][TKey4], undefined> | TDefault
function get<T>(object: NumericDictionary<T>, path: number): T
function get<T>(object: NumericDictionary<T> | null | undefined, path: number): T | undefined
function get<T, TDefault>(
  object: NumericDictionary<T> | null | undefined,
  path: number,
  defaultValue: TDefault
): T | TDefault
function get<TDefault>(object: null | undefined, path: PropertyPath, defaultValue: TDefault): TDefault
function get(object: null | undefined, path: PropertyPath): undefined
function get<TObject, TPath extends string>(
  data: TObject,
  path: TPath
): string extends TPath ? any : GetFieldType<TObject, TPath>
function get<TObject, TPath extends string, TDefault = GetFieldType<TObject, TPath>>(
  data: TObject,
  path: TPath,
  defaultValue: TDefault
): Exclude<GetFieldType<TObject, TPath>, null | undefined> | TDefault
function get(object: any, path: PropertyPath, defaultValue?: any): any
function get(obj: any, path: any, defaultValue = undefined) {
  // https://github.com/you-dont-need/You-Dont-Need-Lodash-Underscore?tab=readme-ov-file#_get
  const travel = (regexp: any) =>
    String
      .prototype
      .split
      .call(path, regexp)
      .filter(Boolean)
      .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj)
  const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/)
  return result === undefined || result === obj ? defaultValue : result
}

// codegen:start {preset: barrel, include: ./utils/*.ts }
export * from "./utils/effectify.js"
export * from "./utils/extend.js"
export * from "./utils/logger.js"
// codegen:end

export const unsafeRight = <E, A>(ei: Either.Either<A, E>) => {
  if (Either.isLeft(ei)) {
    console.error(ei.left)
    throw ei.left
  }
  return ei.right
}

export const unsafeSome = (makeErrorMessage: () => string) => <A>(o: Option.Option<A>) => {
  if (Option.isNone(o)) {
    throw new Error(makeErrorMessage())
  }
  return o.value
}

export function toString(v: unknown) {
  return `${v}`
}

export const typedKeysOf = <T extends {}>(obj: T) => Object.keys(obj) as (keyof T)[]
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
export const typedValuesOf = <T extends {}>(obj: T) => Object.values(obj) as ValueOf<T>[]
type ValueOf<T> = T[keyof T]

export type Constructor<T = any> = { new(...args: any[]): T }
export type ThenArg<T> = T extends Promise<infer U> ? U
  : T extends (...args: any[]) => Promise<infer V> ? V
  : T

/**
 * @deprecated TODO: does not filter optional fields!
 */
type NoUndefinedField<T> = { [P in keyof T]: Exclude<T[P], undefined> }
export function dropUndefinedT<A extends Record<string, any>>(
  input: A
): NoUndefinedField<A> {
  const newR = pipe(
    input,
    D.filter((x): x is A => x !== undefined)
  )
  return newR as any
}

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

// generally A | B is not assignable to A & B
export type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

export type EnforceNonEmptyRecord<R> = keyof R extends never ? never : R

export function intersect<AS extends unknown[] & { 0: unknown }>(
  ...as: AS
): UnionToIntersection<{ [k in keyof AS]: AS[k] }[number]> {
  return as.reduce((a: any, b: any) => ({ ...a, ...b })) as any
}

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
          (<NewDescriptor> targetOrDesc).descriptor
            /* istanbul ignore next */ || targetOrDesc
        )
      }

      return decorateNew(targetOrDesc, setProto, makeNonConfigurable, resultSelector)
    } else {
      if (typeof desc === "undefined") {
        isLegacy = true
        prop = key
        desc = Object.assign(
          {},
          descriptor
            /* istanbul ignore next */ || Object.getOwnPropertyDescriptor(
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

/////

export const LazySymbol = Symbol("lazy")

interface Lazy {
  [LazySymbol]: Record<symbol, any>
}

export function lazyGetter<T extends object, T2>(creator: (target: T) => T2) {
  const key = Symbol(creator.name)
  const f = (target: T): T2 => {
    let lazy = (target as unknown as Lazy)[LazySymbol]
    if (!lazy) {
      lazy = {}
      Object.defineProperty(target, LazySymbol, { enumerable: false, value: lazy })
    } else if (lazy[key]) {
      return lazy[key]
    }
    const value = creator(target)
    lazy[key] = value
    return value
  }
  Object.defineProperty(f, "name", {
    enumerable: false,
    value: `Lazy<${creator.name}>`
  })
  return f
}

export function exhaustiveMatch<T extends string>() {
  return <Out extends Record<T, (t: T) => any>>(handlers: Out) => (t: T): ReturnType<Out[keyof Out]> => handlers[t](t)
}

export function exhaustiveMatch_<T extends string>(t: T) {
  return <Out extends Record<T, (t: T) => any>>(handlers: Out): ReturnType<Out[keyof Out]> => handlers[t](t)
}

export function assertUnreachable(x: never): never {
  throw new Error("Unknown case " + x)
}

export type OptPromise<T extends () => any> = (
  ...args: Parameters<T>
) => Promise<ReturnType<T>> | ReturnType<T>

export function access<T extends string, T2>(t: Record<T, T2>) {
  return (key: T) => t[key] as T2
}

export function todayAtUTCNoon() {
  const localDate = new Date()
  const utcDateAtNoon = Date.UTC(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    12
  )
  return new Date(utcDateAtNoon)
}

function anyOp_$<T>(self: T) {
  return {
    get subject() {
      return self
    }
  }
}

/**
 * @tsplus getter Object $$
 * @tsplus getter number $$
 * @tsplus getter bigint $$
 * @tsplus getter boolean $$
 * @tsplus getter regexp $$
 * @tsplus getter string $$
 */
export function anyOp$<T>(self: T): AnyOps<T> {
  return anyOp_$(self)
}

/**
 * @tsplus type Any.Ops
 * @tsplus type Object.Ops
 */
export interface AnyOps<T> {
  subject: T
}

export const clone = dual<
  <A extends object>(f: NoInfer<A>) => (self: A) => A,
  <A extends object>(self: A, f: A) => A
>(2, (self, f) => {
  if (cloneTrait in (self as any)) {
    const selfWithClone = self as typeof self & Clone
    return selfWithClone[cloneTrait](f)
  }
  return Object.setPrototypeOf(f, Object.getPrototypeOf(self)) as typeof self
})

export const copy = dual<
  {
    <A extends object>(f: (a: A) => Partial<NoInfer<A>>): (self: A) => A
    <A extends object>(f: Partial<NoInfer<A>>): (self: A) => A
  },
  {
    <A extends object>(self: A, f: (a: A) => Partial<A>): A
    <A extends object>(self: A, f: Partial<A>): A
  }
>(
  2,
  <A extends object>(self: A, f: Partial<A> | ((a: A) => Partial<A>)) =>
    clone(self, {
      ...self,
      // TODO: make this configurable instead via Schema field metadata, or trait...
      // could be even the cloneTrait itself
      ...("updatedAt" in self ? { updatedAt: new Date() } : undefined),
      ...(isFunction(f) ? f(self) : f)
    })
)

/**
 * @tsplus fluent Any.Ops debug
 * @tsplus fluent Object.Ops debug
 */
export function debug<A>(a: AnyOps<A>, name: string) {
  let r: string | A = a.subject
  try {
    r = pretty(a.subject)
  } catch { /* empty */ }
  return Effect
    .logDebug("print")
    .pipe(
      Effect.annotateLogs(name, `${r}`),
      Effect
        .map(() => a.subject)
    )
}

/**
 * @tsplus fluent Any.Ops debugUnsafe
 * @tsplus fluent Object.Ops debugUnsafe
 */
export function debugUnsafe<A>(a: AnyOps<A>, name: string) {
  console.log(name, a.subject)
  return a.subject
}

export function spread<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Fields extends Record<any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NewProps
>(fields: Fields, fnc: (fields: Fields) => NewProps) {
  return fnc(fields)
}

export function spreadS<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Fields extends Record<any, any>
>(fields: Fields, fnc: (fields: Fields) => Fields) {
  return fnc(fields)
}

export function makeAzureFriendly(path: string) {
  return path.replace(/\//g, "___SL@SH___")
}

export function undoAzureFriendly<T extends string>(path: T): T {
  return path.replace(/___SL@SH___/g, "/") as T
}

export function arrayMove<T>(
  arrInput: readonly T[],
  oldIndex: number,
  newIndex: number
) {
  const arr: (T | undefined)[] = [...arrInput]
  while (oldIndex < 0) {
    oldIndex += arr.length
  }
  while (newIndex < 0) {
    newIndex += arr.length
  }
  if (newIndex >= arr.length) {
    let k = newIndex - arr.length + 1
    while (k--) {
      arr.push(undefined)
    }
  }
  arr.splice(newIndex, 0, arr.splice(oldIndex, 1)[0])
  return arr
}

export function arrayMoveDropUndefined<T>(
  arrInput: readonly (T | undefined)[],
  oldIndex: number,
  newIndex: number
): T[] {
  return arrayMove(arrInput, oldIndex, newIndex).filter((x): x is T => x !== undefined)
}

export function arMoveElDropUndefined<T>(el: T, newIndex: number) {
  return (arrInput: ReadonlyArray<T | undefined>): Option.Option<ReadonlyArray<T>> => {
    const ar = [...arrInput]
    const index = ar.findIndex((x) => x === el)
    if (index === -1) {
      return Option.none()
    }
    return Option.some(arrayMoveDropUndefined(ar, index, newIndex))
  }
}

export function setMoveElDropUndefined<T>(el: T, newIndex: number) {
  return (arrInput: ReadonlySet<T | undefined>): Option.Option<ReadonlySet<T>> =>
    pipe([...arrInput], arMoveElDropUndefined(el, newIndex), Option.map((ar) => new Set(ar)))
}

export { get }

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K>
  : never

type RemoveNonArray<T> = T extends readonly any[] ? T : never
export function isNativeTuple<A>(a: A): a is RemoveNonArray<A> {
  return Array.isArray(a)
}

export type Writable<T> = { -readonly [P in keyof T]: T[P] }

export type DeepWritable<T> = { -readonly [P in keyof T]: DeepWritable<T[P]> }

export const writable: { <A>(a: A, deep: true): DeepWritable<A>; <A>(a: A): Writable<A> } = identity
