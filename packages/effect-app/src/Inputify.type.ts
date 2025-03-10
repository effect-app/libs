import type { BuiltInObject } from "effect-app/utils"

import type { Primitive } from "./Widen.type.js"

// Get rid of Date | string, and replace with Date | null
export type Inputify<T> = Date extends T ? string extends T ? Date | null
  : Date | null
  : [T] extends [BuiltInObject] | [Primitive] ? T
  : [T] extends [Array<unknown>] ? { [K in keyof T]: Inputify<T[K]> }
  : [T] extends [ReadonlyArray<unknown>] ? { [K in keyof T]: Inputify<T[K]> }
  : [T] extends [object] ? { [K in keyof T]: Inputify<T[K]> }
  : T
