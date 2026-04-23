/**
 * SpecialJsonSchema — A variant of Schema.toJsonSchemaDocument that
 * post-processes the output (e.g. flattens simple allOf).
 */
import { type JsonSchema, type Schema, SchemaRepresentation } from "effect"

/**
 * Converts a schema to a JSON Schema Document (draft-2020-12), with
 * post-processing that flattens simple allOf entries.
 */
export function specialJsonSchemaDocument(
  schema: Schema.Top,
  options?: Schema.ToJsonSchemaOptions
): JsonSchema.Document<"draft-2020-12"> {
  const doc = SchemaRepresentation.fromAST(schema.ast)
  const jd = SchemaRepresentation.toJsonSchemaDocument(doc, options)
  const processedDefs: JsonSchema.Definitions = {}
  for (const [key, def] of Object.entries(jd.definitions)) {
    processedDefs[key] = postProcessJsonSchema(def)
  }
  return {
    dialect: "draft-2020-12",
    schema: postProcessJsonSchema(jd.schema),
    definitions: processedDefs
  }
}

/**
 * Flattens `allOf` entries into the parent when the parent already has a
 * `type` and every `allOf` entry is a plain constraint object (no `$ref`,
 * no `type`). Merged properties from `allOf` entries win on conflict.
 */
export function flattenSimpleAllOf(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj

  if (globalThis.Array.isArray(obj)) {
    return obj.map(flattenSimpleAllOf)
  }

  const record = obj as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    result[key] = flattenSimpleAllOf(value)
  }

  if (result["type"] && globalThis.Array.isArray(result["allOf"])) {
    const allOf = result["allOf"] as Array<Record<string, unknown>>
    const canFlatten = allOf.every((entry) =>
      typeof entry === "object" && entry !== null && !("$ref" in entry) && !("type" in entry)
    )
    if (canFlatten) {
      const { allOf: _, ...rest } = result
      const merged: Record<string, unknown> = { ...rest }
      for (const entry of allOf) {
        Object.assign(merged, entry)
      }
      return merged
    }
  }

  return result
}

/**
 * Recursively removes `additionalProperties: false` from JSON Schema objects.
 * Only removes when the value is exactly `false` -- other values are left intact.
 */
export function removeAdditionalPropertiesFalse(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj

  if (globalThis.Array.isArray(obj)) {
    return obj.map(removeAdditionalPropertiesFalse)
  }

  const record = obj as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === "additionalProperties" && value === false) continue
    result[key] = removeAdditionalPropertiesFalse(value)
  }

  return result
}

/**
 * Flattens nested `anyOf` entries: if an anyOf entry is itself just `{ anyOf: [...] }`
 * with no other keys, its children are inlined. If only one item remains, the anyOf
 * wrapper is removed entirely.
 */
export function flattenNestedAnyOf(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj
  if (globalThis.Array.isArray(obj)) return obj.map(flattenNestedAnyOf)

  const record = obj as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    result[key] = flattenNestedAnyOf(value)
  }

  if (globalThis.Array.isArray(result["anyOf"])) {
    const anyOf = result["anyOf"] as Array<unknown>
    const flattened: Array<unknown> = []
    for (const entry of anyOf) {
      if (
        typeof entry === "object"
        && entry !== null
        && !globalThis.Array.isArray(entry)
        && "anyOf" in entry
        && Object.keys(entry).length === 1
        && globalThis.Array.isArray((entry as Record<string, unknown>)["anyOf"])
      ) {
        flattened.push(...(entry as Record<string, unknown>)["anyOf"] as Array<unknown>)
      } else {
        flattened.push(entry)
      }
    }
    if (flattened.length === 1) {
      const { anyOf: _, ...rest } = result
      const single = flattened[0]
      if (typeof single === "object" && single !== null && !globalThis.Array.isArray(single)) {
        return { ...rest, ...single }
      }
      return single
    }
    result["anyOf"] = flattened
  }

  return result
}

/**
 * Applies JSON Schema post-processing: flattens simple allOf,
 * flattens nested anyOf, then strips additionalProperties: false.
 */
export function postProcessJsonSchema(obj: JsonSchema.JsonSchema): JsonSchema.JsonSchema {
  return removeAdditionalPropertiesFalse(flattenNestedAnyOf(flattenSimpleAllOf(obj))) as JsonSchema.JsonSchema
}
