import { Effect } from "effect"
import { brandedStringId, type Codec, NonEmptyString255, StringId, type StringIdBrand, withDefaultMake } from "effect-app/Schema"
import type { B } from "effect-app/Schema/schema"
import type { Simplify } from "effect/Types"
import { S } from "./index.js"
import { extendM } from "./utils.js"

export interface RequestIdBrand extends StringIdBrand {
  readonly RequestId: unique symbol
}

export type RequestId = NonEmptyString255
/**
 * Schema for a request id.
 *
 * A request id may be made from a span id, which does not comply with the
 * `StringId` schema (hence the looser `NonEmptyString255` base).
 *
 * `.withConstructorDefault` => fresh `StringId` (construction-only; not
 * applied during decode — cannot be used to JIT-migrate database fields).
 * See `./Schema/ext.ts` for the full policy note.
 */
export const RequestId = extendM(
  Object
    .assign(Object.create(NonEmptyString255) as {}, NonEmptyString255 as unknown as Codec<NonEmptyString255, string>),
  (s) => {
    const make = StringId.make as () => NonEmptyString255
    return ({
      make,
      /**
       * Construction-only default: fresh `StringId`. Applied only when the
       * field is omitted from `.make(...)` input. NOT applied during decode —
       * cannot be used to JIT-migrate database fields. See `./Schema/ext.ts`
       * file-level note.
       */
      withConstructorDefault: S.withConstructorDefault(Effect.sync(make))(s as typeof s & S.WithoutConstructorDefault)
    })
  }
)
  .pipe(withDefaultMake)

export interface UserProfileIdBrand extends Simplify<B.Brand<"UserProfileId"> & StringIdBrand> {}
export type UserProfileId = string & UserProfileIdBrand
/**
 * Branded `StringId` for user profiles.
 *
 * Exposes `.withConstructorDefault` (fresh id) — construction-only; not
 * applied during decode. See `./Schema/ext.ts` for the full policy note.
 */
export const UserProfileId = brandedStringId<UserProfileId>()
