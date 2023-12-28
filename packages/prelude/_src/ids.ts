import { brandedStringId, type StringIdBrand } from "@effect-app/schema"
import type { B } from "@effect-app/schema/schema"
import type { Simplify } from "effect/Types"

export interface RequestIdBrand extends StringIdBrand {
  readonly RequestId: unique symbol
}

/**
 * @tsplus type RequestId
 */
export type RequestId = NonEmptyString255
// a request id may be made from a span id, which does not comply with StringId schema.
export const RequestId = Object
  // eslint-disable-next-line @typescript-eslint/ban-types
  .assign(Object.create(NonEmptyString255) as {}, NonEmptyString255, { make: StringId.make })
  .withDefaultMake(() => StringId.make())

export interface UserProfileIdBrand extends Simplify<B.Brand<"UserProfileId"> & StringIdBrand> {}
/**
 * @tsplus type UserProfileId
 */
export type UserProfileId = StringId & UserProfileIdBrand
export const UserProfileId = brandedStringId<UserProfileIdBrand>()
