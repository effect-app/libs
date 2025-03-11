import { brandedStringId, NonEmptyString255, type Schema, StringId, type StringIdBrand, withDefaultMake } from "effect-app/Schema"
import type { B } from "effect-app/Schema/schema"
import type { Simplify } from "effect/Types"
import { S } from "./index.js"
import { extendM } from "./utils.js"

export interface RequestIdBrand extends StringIdBrand {
  readonly RequestId: unique symbol
}

export type RequestId = NonEmptyString255
// a request id may be made from a span id, which does not comply with StringId schema.
export const RequestId = extendM(
  Object
    .assign(Object.create(NonEmptyString255) as {}, NonEmptyString255 as Schema<NonEmptyString255, string>),
  (s) => {
    const make = StringId.make as () => NonEmptyString255
    return ({
      make,
      withDefault: s.pipe(S.withDefaultConstructor(make))
    })
  }
)
  .pipe(withDefaultMake)

export interface UserProfileIdBrand extends Simplify<B.Brand<"UserProfileId"> & StringIdBrand> {}
export type UserProfileId = StringId & UserProfileIdBrand
export const UserProfileId = brandedStringId<UserProfileId>()
