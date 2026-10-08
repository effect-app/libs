export * from "effect/Function"
export type { Predicate, Refinement } from "effect/Predicate"

/* eslint-disable @typescript-eslint/no-explicit-any */

export function tupledCurry<A, B, C>(f: (b: B) => (a: A) => C) {
  return (t: [A, B]) => f(t[1])(t[0])
}

export function reverseCurry<A, B, C>(f: (b: B) => (a: A) => C) {
  return (a: A) => (b: B) => f(b)(a)
}

export function curry<A, B, C>(f: (a: A, b: B) => C) {
  return (b: B) => (a: A) => f(a, b)
}

export function uncurry<A, B, C>(f: (b: B) => (a: A) => C) {
  return (a: A, b: B) => f(b)(a)
}

// It's better to have these expanded, so that on the call site you understand the functions better.
// type OptMagix<A, B, C> = ((b?: B) => (a: A) => C) & {
//   /**
//    * Uncurried version of the parent function
//    */
//   _: (a: A, b?: B) => C
//   /**
//    * Reverse curried version of the parent function
//    */
//   r: (a: A) => (b?: B) => C
// }
// type Magix<A, B, C> = ((b: B) => (a: A) => C) & {
//   /**
//    * Uncurried version of the parent function
//    */
//   _: (a: A, b: B) => C
//   /**
//    * Reverse curried version of the parent function
//    */
//   r: (a: A) => (b: B) => C
// }

export function curriedMagix<A, B, C>(
  f: (b?: B) => (a: A) => C
): ((b?: B) => (a: A) => C) & {
  /**
   * Uncurried version of the parent function
   */
  _: (a: A, b?: B) => C
  /**
   * Reverse curried version of the parent function
   */
  r: (a: A) => (b?: B) => C
}
export function curriedMagix<A, B, C>(
  f: (b: B) => (a: A) => C
): ((b: B) => (a: A) => C) & {
  /**
   * Uncurried version of the parent function
   */
  _: (a: A, b: B) => C
  /**
   * Reverse curried version of the parent function
   */
  r: (a: A) => (b: B) => C
}
export function curriedMagix<A, B, C>(f: (b: B) => (a: A) => C) {
  return Object.assign(f, {
    /**
     * Uncurried version of the parent function
     */
    _: uncurry(f),
    /**
     * Reverse curried version of the parent function
     */
    r: reverseCurry(f)
  })
}

export function uncurriedMagix<A, B, C>(
  f: (a: A, b?: B) => C
): ((b?: B) => (a: A) => C) & {
  /**
   * Uncurried version of the parent function
   */
  _: (a: A, b?: B) => C
  /**
   * Reverse curried version of the parent function
   */
  r: (a: A) => (b?: B) => C
}
export function uncurriedMagix<A, B, C>(
  f: (a: A, b: B) => C
): ((b: B) => (a: A) => C) & {
  /**
   * Uncurried version of the parent function
   */
  _: (a: A, b: B) => C
  /**
   * Reverse curried version of the parent function
   */
  r: (a: A) => (b: B) => C
}
export function uncurriedMagix<A, B, C>(f: (a: A, b: B) => C) {
  const curried = curry(f)
  return Object.assign(curried, {
    /**
     * Uncurried version of the parent function
     */
    _: f,
    /**
     * Reverse curried version of the parent function
     */
    r: reverseCurry(curried)
  })
}

export function reverseCurriedMagix<A, B, C>(
  f: (a: A) => (b: B) => C
): ((b?: B) => (a: A) => C) & {
  /**
   * Uncurried version of the parent function
   */
  _: (a: A, b?: B) => C
  /**
   * Reverse curried version of the parent function
   */
  r: (a: A) => (b?: B) => C
}
export function reverseCurriedMagix<A, B, C>(
  f: (a?: A) => (b: B) => C
): ((b: B) => (a: A) => C) & {
  /**
   * Uncurried version of the parent function
   */
  _: (a: A, b: B) => C
  /**
   * Reverse curried version of the parent function
   */
  r: (a: A) => (b: B) => C
}
export function reverseCurriedMagix<A, B, C>(f: (a: A) => (b: B) => C) {
  const curried = reverseCurry(f)
  return Object.assign(curried, {
    /**
     * Uncurried version of the parent function
     */
    _: uncurry(curried),
    /**
     * Reverse curried version of the parent function
     */
    r: f
  })
}

export function lazy<A>(f: () => A): () => A {
  let tmp: A | undefined
  let done = false
  return () => {
    if (done) {
      return tmp!
    }
    tmp = f()
    done = true
    return tmp
  }
}
