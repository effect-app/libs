import { Cause } from "@effect-ts/core/Effect/Cause"
import * as Ex from "@effect-ts/core/Effect/Exit"
import { Exit } from "@effect-ts/core/Effect/Exit"

import { equals } from "@effect-ts/system/Structural/HasEquals"
import React from "react"

export type PromiseExit<E = unknown, A = unknown> = Promise<Exit<E, A>>

export function onFail<E, T>(cb: (a: Cause<E>) => T) {
  return Ex.fold<E, unknown, T, void>(cb, () => void 0)
}

export function onSuccess<A, T>(cb: (a: A) => T) {
  return Ex.fold<unknown, A, void, T>(() => void 0, cb)
}

/**
 *
const something = {}
assert.strictEqual(shallowEqual({ a: Option.none }, { a: Option.none }), true)
assert.strictEqual(shallowEqual({ a: Option.some(1)}, { a: Option.some(1) }), true)
assert.strictEqual(shallowEqual({ a: Option.some(something)}, { a: Option.some(something) }), true)
assert.strictEqual(shallowEqual({ a: Option.some(something)}, { a: Option.none }), false)

assert.strictEqual(shallowEqual({ a: Either.left(something)}, { a: Either.left(something) }), true)
assert.strictEqual(shallowEqual({ a: Either.right(something)}, { a: Either.left(something) }), false)
assert.strictEqual(shallowEqual({ a: Either.left(1)}, { a: Either.left(2) }), false)
assert.strictEqual(shallowEqual({ a: Either.right(1)}, { a: Either.right(2) }), false)

// Works by default
assert.strictEqual(shallowEqual(1, 1), true)
assert.strictEqual(shallowEqual(1, 0), false)
assert.strictEqual(shallowEqual(Option.none, Option.none), true)
assert.strictEqual(shallowEqual(Option.some(something), Option.some(something)), true)
assert.strictEqual(shallowEqual(Option.some(something), Option.none), false)

assert.strictEqual(shallowEqual(Either.left(something), Either.left(something)), true)
assert.strictEqual(shallowEqual(Either.right(something), Either.left(something)), false)
assert.strictEqual(shallowEqual(Either.left(1), Either.left(2)), false)
assert.strictEqual(shallowEqual(Either.right(1), Either.right(2)), false)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shallowEqual(objA: any, objB: any) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== "object" ||
    objA === null ||
    typeof objB !== "object" ||
    objB === null
  ) {
    return false
  }

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) {
    return false
  }

  // Test for A's keys different from B.
  for (let i = 0; i < keysA.length; i++) {
    if (!Object.hasOwnProperty.call(objB, keysA[i])) {
      return false
    }
    // supports effect-ts hash and equals implementations
    if (!equals(objA[keysA[i]], objB[keysA[i]])) {
      return false
    }
  }

  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memo<T extends React.ComponentType<any>>(f: T) {
  return React.memo(f, shallowEqual)
}

export function useEffect(effect: React.EffectCallback, deps: React.DependencyList) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useEffect(effect, mapDeps(deps))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(callback, mapDeps(deps))
}

export function useMemo<T>(factory: () => T, deps: React.DependencyList) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(factory, mapDeps(deps))
}

function mapDeps(deps: React.DependencyList) {
  return deps.map(convertDep)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDep(x: any) {
  return typeof x !== "object" || x === null
    ? x
    : Option.isSome(x) || Option.isNone(x)
    ? Option.toNullable(x)
    : Either.isLeft(x)
    ? x.left
    : Either.isRight(x)
    ? x.right
    : x
}
