import * as S from "../_schema.js"
import * as Constructor from "../Constructor.js"
import type { DefaultSchema } from "./withDefaults.js"
import { withDefaults } from "./withDefaults.js"

export type OptionalKey<ConstructorInput, Key extends keyof ConstructorInput> =
  & Omit<
    ConstructorInput,
    Key
  >
  & Partial<Pick<ConstructorInput, Key>>

export const withDefaultConstructorFieldIdentifier = S.makeAnnotation<{
  key: PropertyKey
  value: LazyArg<unknown>
  self: S.SchemaAny
}>()

export function withDefaultConstructorField<
  ConstructorInput,
  Key extends keyof ConstructorInput
>(
  key: Key,
  value: LazyArg<ConstructorInput[Key]>
): <ParserInput, ParsedShape, Encoded, Api>(
  self: S.Schema<ParserInput, ParsedShape, ConstructorInput, Encoded, Api>
) => DefaultSchema<
  ParserInput,
  ParsedShape,
  OptionalKey<ConstructorInput, Key>,
  Encoded,
  Api
> {
  return self => {
    const constructSelf = Constructor.for(self)
    return pipe(
      self,
      S.constructor((u: any) => constructSelf(typeof u[key] !== "undefined" ? u : { ...u, [key]: value() })),
      withDefaults,
      S.annotate(withDefaultConstructorFieldIdentifier, { self, key, value })
    )
  }
}
