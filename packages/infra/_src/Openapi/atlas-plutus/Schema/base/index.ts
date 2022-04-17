/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type * as A from "@effect-ts/core/Collections/Immutable/Array"
import * as T from "@effect-ts/core/Effect"
import * as TRef from "@effect-ts/core/Effect/Ref"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import { pipe } from "@effect-ts/system/Function"

import type { JSONSchema, SubSchema } from "../../JsonSchema/index.js"
import { Ref } from "../../JsonSchema/index.js"

export interface References {
  ref: TRef.Ref<Map<string, SubSchema>>
}

export const References = tag<References>()

export class UnsupportedOperation {
  readonly _tag = "UnsupportedOperation"
  constructor(readonly errors: A.Array<string>) {}
}

export interface ConfigExtensionRef {
  openapiRef?: string
}

export interface ConfigExtensionMeta {
  openapiMeta?: any
}

export type Schema = T.RIO<Has<References>, JSONSchema | SubSchema>

export const SchemaURI = "SchemaURI" as const
export type SchemaURI = typeof SchemaURI

export function referenced(x?: ConfigExtensionRef) {
  return (schema: Schema): Schema => {
    if (x && typeof x.openapiRef !== "undefined") {
      const { openapiRef } = x
      return T.gen(function* (_) {
        const { ref } = yield* _(References)
        const jsonSchema = yield* _(schema)
        yield* _(
          pipe(
            ref,
            TRef.update((m) => m.set(openapiRef, jsonSchema))
          )
        )
        return Ref(`#/components/schemas/${openapiRef}`)
      })
    }
    return schema
  }
}

export class SchemaType<E, A> {
  _E!: E
  _A!: A
  _URI!: SchemaURI
  constructor(public Schema: Schema) {}
}

export const succeed = (_: SubSchema) => T.succeed(_)
export const dieMessage = (_: string) => T.die(new UnsupportedOperation([_]))

export function described(description: string) {
  return T.map(
    (schema: SubSchema): SubSchema => ({
      ...schema,
      description,
    })
  )
}

export function titled(title: string) {
  return T.map(
    (schema: SubSchema): SubSchema => ({
      ...schema,
      title,
    })
  )
}
