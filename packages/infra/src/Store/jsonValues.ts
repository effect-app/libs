import * as Context from "effect-app/Context"
import * as Layer from "effect-app/Layer"
import * as S from "effect-app/Schema"

/**
 * Native Encoded value that is not JSON, plus how to lower it for document-DB
 * adapters. Date / Map / Set are built in; app schemas (DateOnly, money, …)
 * register here instead of being special-cased in effect-app.
 */
export interface JsonValueHandler {
  readonly is: (u: unknown) => boolean
  readonly toJson: (u: unknown) => unknown
}

const registered: JsonValueHandler[] = []

/** Process-wide handler. Prefer {@link JsonValues} / StoreConfig.jsonValues. */
export const registerJsonValue = (handler: JsonValueHandler) => {
  registered.push(handler)
}

/**
 * Register a schema whose Encoded form is a native (non-JSON) value.
 * Uses `Schema.is(toEncoded(schema))` and `toCodecJson(toEncoded(schema))`.
 */
export const registerJsonSchema = (schema: S.Top) => {
  registered.push(handlerForSchema(schema))
}

export const jsonValueHandlers = () => registered

export const handlerForSchema = (schema: S.Top): JsonValueHandler => {
  const encoded = S.toEncoded(schema)
  const json = S.toCodecJson(encoded)
  return {
    is: (u) => S.is(encoded)(u),
    toJson: (u) => S.encodeSync(json)(u)
  }
}

export const jsonHandlersFromSchemas = (schemas: readonly S.Top[]): JsonValueHandler[] => schemas.map(handlerForSchema)

/**
 * App-provided schemas whose Encoded values are native (DateOnly, branded
 * money, …). Store adapters merge this with `StoreConfig.jsonValues`.
 */
export class JsonValues extends Context.Service<JsonValues, {
  readonly schemas: readonly S.Top[]
}>()("effect-app/Store/JsonValues") {}

export const JsonValuesLayer = (schemas: readonly S.Top[]) => Layer.succeed(JsonValues, { schemas })
