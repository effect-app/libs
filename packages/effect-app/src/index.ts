import "./builtin.js"

import * as ServiceMap from "./ServiceMap.js"

export * as Fnc from "./Function.js"
export * as Utils from "./utils.js"

export * as Array from "./Array.js"
export * as Effect from "./Effect.js"
export * as Layer from "./Layer.js"
export * as NonEmptySet from "./NonEmptySet.js"
export * as ServiceMap from "./ServiceMap.js"
export * as Set from "./Set.js"

export {
  /**
   * @deprecated use ServiceMap directly instead
   */
  ServiceMap as Context
}

export { type NonEmptyArray, type NonEmptyReadonlyArray } from "./Array.js"

export * from "effect"

export type * as Types from "./Types.js"

export * as SecretURL from "./Config/SecretURL.js"
export * as S from "./Schema.js"
export { copy } from "./utils.js"
