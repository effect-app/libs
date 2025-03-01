export * as Fnc from "../Function.js"
export * as Utils from "../utils.js"

// we cannot export types colliding with namespaces from .ts files, only from .d.ts files with custom .js trick, applied in effect-app
// for app land, it may make sense to create an app/prelude?
export * from "./Prelude.js"

export {
  Array,
  Cause,
  Chunk,
  Config,
  Context,
  Duration,
  Effect,
  Either,
  Equal,
  Equivalence,
  Exit,
  FiberRef,
  HashMap,
  Layer,
  Option,
  Order,
  Record,
  Ref,
  Schema,
  Scope
} from "./Prelude.js"

export * as Struct from "../Struct.js"
export type * as Types from "../Types.js"

export * as SecretURL from "../Config/SecretURL.js"
export * as S from "../Schema.js"
export { copy } from "../utils.js"

export * from "effect"
