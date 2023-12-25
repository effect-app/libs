import { pipe } from "@effect-app/core/Function"

import { makeAnnotation, parseBoolE } from "../_schema.js"
import * as S from "../_schema.js"
import * as Th from "../These.js"
import { refinement } from "./refinement.js"
import type { DefaultSchema } from "./withDefaults.js"
import { withDefaults } from "./withDefaults.js"

export const boolIdentifier = makeAnnotation<{}>()

export const bool: DefaultSchema<unknown, boolean, boolean, boolean, {}> = pipe(
  refinement(
    (u): u is boolean => typeof u === "boolean",
    (v) => S.leafE(parseBoolE(v))
  ),
  S.constructor((s: boolean) => Th.succeed(s)),
  S.arbitrary((_) => _.boolean()),
  S.encoder((s) => s),
  S.mapApi(() => ({})),
  withDefaults,
  S.annotate(boolIdentifier, {})
)
