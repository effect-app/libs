import * as SchemaParser from "effect/SchemaParser"
import { withDefaultParseOptions } from "./ext.js"

export * from "effect/SchemaParser"

export const decodeEffectConcurrently: typeof SchemaParser.decodeEffect = withDefaultParseOptions(
  SchemaParser.decodeEffect
)

export const decodeUnknownEffectConcurrently: typeof SchemaParser.decodeUnknownEffect = withDefaultParseOptions(
  SchemaParser.decodeUnknownEffect
)
