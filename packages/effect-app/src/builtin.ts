// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./builtin-json.d.ts" />
import type { NonEmptyArray, NonEmptyReadonlyArray } from "effect/Array"

declare global {
  interface String {
    /**
     * Split a string into substrings using the specified separator and return them as an array.
     * @param splitter An object that can split a string.
     * @param limit A value used to limit the number of elements returned in the array.
     */
    split(splitter: { [Symbol.split](string: string, limit?: number): string[] }, limit?: number): [string, ...string[]]

    /**
     * Split a string into substrings using the specified separator and return them as an array.
     * @param separator A string that identifies character or characters to use in separating the string. If omitted, a single-element array containing the entire string is returned.
     * @param limit A value used to limit the number of elements returned in the array.
     */
    split(separator: string | RegExp, limit?: number): [string, ...string[]]
  }

  // JSON.parse / Body.json overrides live in ./builtin-json.d.ts (referenced
  // above) so a source-linked consumer can disable them in linked mode.

  interface Array<T> {
    // Conditional return instead of a `this`-typed overload: a `this` overload
    // is selected-then-rejected on union-of-array receivers (TS2684), poisoning
    // foreign code like `(readonly A[] | readonly B[]).map(...)`. A single
    // conditional-return signature refines NonEmpty without a `this` param.
    map<U>(
      callbackfn: (value: T, index: number, array: T[]) => U,
      thisArg?: any
    ): this extends NonEmptyArray<any> ? NonEmptyArray<U> : U[]
  }
  interface ReadonlyArray<T> {
    // Subsequent property declarations must have the same type.  Property 'length' must be of type 'number', but here has type 'NonNegativeInt'.
    // readonly length: NonNegativeInt

    map<U>(
      callbackfn: (value: T, index: number, array: readonly T[]) => U,
      thisArg?: any
    ): this extends NonEmptyReadonlyArray<any> ? NonEmptyReadonlyArray<U> : U[]
  }
}

declare module "effect/Option" {
  export interface None<out A> {
    get value(): A | undefined
  }
}

// TODO: v4 migration — Either module augmentation removed (Either → Result)
// Previously added .right to Left and .left to Right for convenience access
