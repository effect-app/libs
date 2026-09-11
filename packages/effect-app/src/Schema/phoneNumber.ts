import type { Refinement } from "effect-app/Function"
import { isValidPhone } from "effect-app/validation"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { withDefaultMake } from "./ext.ts"
import type { B } from "./schema.ts"
import type { NonEmptyStringBrand } from "./strings.ts"

export interface PhoneNumberBrand extends Simplify<B.Brand<"PhoneNumber"> & NonEmptyStringBrand> {}
export type PhoneNumber = string & PhoneNumberBrand

export const PhoneNumber = S
  .String
  .pipe(
    S.annotate({
      title: "PhoneNumber",
      description: "a phone number with at least 7 digits",
      format: "phone"
    }),
    S.refine(isValidPhone as Refinement<string, PhoneNumber>, {
      identifier: "PhoneNumber",
      description: "a phone number with at least 7 digits",
      jsonSchema: { format: "phone" }
    }),
    withDefaultMake
  )
