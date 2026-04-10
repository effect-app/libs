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
      let merged: Record<string, unknown> = { ...rest }
      for (const entry of allOf) {
        merged = { ...merged, ...entry }
      }
      return merged
    }
  }

  return result
}

/**
 * Applies JSON Schema post-processing: flattens simple allOf.
 */
export function postProcessJsonSchema(obj: JsonSchema.JsonSchema): JsonSchema.JsonSchema {
  return flattenSimpleAllOf(obj) as JsonSchema.JsonSchema
}
