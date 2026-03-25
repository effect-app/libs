import type { Refinement } from "effect-app/Function"
import { isValidPhone } from "effect-app/validation"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { withDefaultMake } from "./ext.js"
import { Numbers } from "./FastCheck.js"
import type { B } from "./schema.js"
import type { NonEmptyStringBrand } from "./strings.js"

export interface PhoneNumberBrand extends Simplify<B.Brand<"PhoneNumber"> & NonEmptyStringBrand> {}
export type PhoneNumber = string & PhoneNumberBrand

export const PhoneNumber = S
  .String
  .pipe(
    S.refine(isValidPhone as Refinement<string, PhoneNumber>, {
      identifier: "PhoneNumber",
      title: "PhoneNumber",
      description: "a phone number with at least 7 digits",
      jsonSchema: { format: "phone" }
    }),
    S.annotate({
      toArbitrary: () => (fc) => Numbers(7, 10)(fc).map((_) => _ as PhoneNumber)
    }),
    withDefaultMake
  )
