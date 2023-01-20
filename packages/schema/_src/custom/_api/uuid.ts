import type { Refinement } from "@effect-app/core/Function"
import { pipe } from "@effect-app/core/Function"

import * as S from "../_schema.js"
import { customE } from "../_schema.js"
import { brand } from "./brand.js"
import type { NonEmptyString } from "./nonEmptyString.js"
import { fromString, string } from "./string.js"
import type { DefaultSchema } from "./withDefaults.js"

export interface UUIDBrand {
  readonly UUID: unique symbol
}

export const regexUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type UUID = NonEmptyString & UUIDBrand

export const UUIDFromStringIdentifier = S.makeAnnotation<{}>()

const isUUID: Refinement<string, UUID> = (s: string): s is UUID => {
  return regexUUID.test(s)
}

export const UUIDFromString: DefaultSchema<string, UUID, string, string, {}> = pipe(
  fromString,
  S.arbitrary(FC => FC.uuid()),
  S.refine(isUUID, n => S.leafE(customE(n, "a valid UUID"))),
  brand<UUID>(),
  S.annotate(UUIDFromStringIdentifier, {})
)

export const UUIDIdentifier = S.makeAnnotation<{}>()

export const UUID: DefaultSchema<
  unknown,
  UUID,
  string,
  string,
  S.ApiSelfType<UUID>
> = pipe(string[">>>"](UUIDFromString), brand<UUID>(), S.annotate(UUIDIdentifier, {}))
