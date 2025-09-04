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

  interface JSON {
    /**
     * Converts a JavaScript Object Notation (JSON) string into an object.
     * @param text A valid JSON string.
     * @param reviver A function that transforms the results. This function is called for each member of the object.
     * If a member contains nested objects, the nested objects are transformed before the parent object is.
     */
    parse(text: string, reviver?: (this: any, key: string, value: any) => any): unknown
  }

  interface Body {
    json(): Promise<unknown>
  }

  interface Array<T> {
    map<A, B>(
      this: NonEmptyArray<A>,
      map: (a: A, index: number) => B
    ): NonEmptyArray<B>
  }
  interface ReadonlyArray<T> {
    // Subsequent property declarations must have the same type.  Property 'length' must be of type 'number', but here has type 'NonNegativeInt'.
    // readonly length: NonNegativeInt

    map<A, B>(
      this: NonEmptyReadonlyArray<A>,
      map: (a: A, index: number) => B
    ): NonEmptyReadonlyArray<B>
  }
}

declare module "effect/Option" {
  export interface None<out A> {
    get value(): A | undefined
  }
}

declare module "effect/Either" {
  export interface Left<E, A> {
    get right(): A | undefined
  }
  export interface Right<E, A> {
    get left(): E | undefined
  }
}
