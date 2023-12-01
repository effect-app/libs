/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { HasContinuation, SchemaAny } from "@effect-app/schema"
import { Schema, SchemaContinuationSymbol } from "@effect-app/schema"

import type { JSONSchema } from "./atlas-plutus.js"

export class SchemaOpenApi<ParserInput, To, ConstructorInput, From, Api>
  extends Schema<ParserInput, To, ConstructorInput, From, Api>
  implements HasContinuation
{
  readonly Api = this.self.Api
  readonly [SchemaContinuationSymbol]: SchemaAny
  constructor(
    readonly self: Schema<ParserInput, To, ConstructorInput, From, Api>,
    readonly jsonSchema: () => JSONSchema
  ) {
    super()
    this[SchemaContinuationSymbol] = self
  }
}

export function openapi<To>(f: () => JSONSchema) {
  return <ParserInput, ConstructorInput, From, Api>(
    self: Schema<ParserInput, To, ConstructorInput, From, Api>
  ): Schema<ParserInput, To, ConstructorInput, From, Api> => new SchemaOpenApi(self, f) as any
}

export function openapi_<ParserInput, To, ConstructorInput, From, Api>(
  self: Schema<ParserInput, To, ConstructorInput, From, Api>,
  f: () => JSONSchema
): Schema<ParserInput, To, ConstructorInput, From, Api> {
  return new SchemaOpenApi(self, f)
}
