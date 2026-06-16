import type { Refinement } from "effect-app/Function"
import { isValidPhone } from "effect-app/validation"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { withDefaultMake } from "./ext.ts"
import { Numbers } from "./FastCheck.ts"
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
    S.annotate({
      toArbitrary: () => (fc) => Numbers(7, 10)(fc).map((_) => _ as PhoneNumber)
    }),
    withDefaultMake
  )
