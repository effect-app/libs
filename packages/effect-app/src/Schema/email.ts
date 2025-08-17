import type { Refinement } from "effect-app/Function"
import { isValidEmail } from "effect-app/validation"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import type { B } from "./schema.js"
import type { NonEmptyStringBrand } from "./strings.js"

export interface EmailBrand extends Simplify<NonEmptyStringBrand & B.Brand<"Email">> {}

export type Email = string & EmailBrand

export const Email = S
  .String
  .pipe(
    S.filter(isValidEmail as Refinement<string, Email>, {
      identifier: "Email",
      title: "Email",
      description: "an email according to RFC 5322",
      jsonSchema: { format: "email", minLength: 3, /* a@b */ maxLength: 998 },
      arbitrary: () => (fc) => fc.emailAddress().map((_) => _ as Email)
    })
  )
