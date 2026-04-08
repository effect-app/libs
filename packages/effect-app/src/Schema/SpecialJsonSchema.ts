/**
 * SpecialJsonSchema — A variant of Schema.toJsonSchemaDocument that deduplicates
 * references sharing the same identifier when they produce identical
 * representations (based on a string fingerprint).
 *
 * Without this, two different AST nodes that have the same identifier and
 * resolve to the same JSON Schema representation can end up as separate $defs
 * entries (e.g. "X" and "X1"). This converter collapses them into one.
 */
import { Formatter, type JsonSchema, type Schema, SchemaRepresentation } from "effect"

/**
 * Converts a schema to a JSON Schema Document (draft-2020-12), with an
 * extra deduplication pass that collapses references sharing the same
 * base identifier when their representations are identical.
 *
 * @example
 * ```ts
 * import { Schema, SchemaGetter, Option, Predicate } from "effect"
 * import { specialJsonSchemaDocument } from "./SpecialJsonSchema.js"
 *
 * const X = Schema.String.annotate({ title: "X", identifier: "X" })
 *
 * const s = Schema.Struct({
 *   a: Schema.NullOr(X).pipe(
 *     Schema.encodeTo(Schema.optionalKey(X), {
 *       decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
 *       encode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull))
 *     })
 *   ),
 *   b: Schema.NullOr(X),
 *   c: X
 * })
 *
 * // Without dedup: $defs would contain both "X" and "X1" (identical).
 * // With specialJsonSchemaDocument: only "X" is emitted.
 * const doc = specialJsonSchemaDocument(s)
 * ```
 */
export function specialJsonSchemaDocument(
  schema: Schema.Top,
  options?: Schema.ToJsonSchemaOptions
): JsonSchema.Document<"draft-2020-12"> {
  const doc = SchemaRepresentation.fromAST(schema.ast)
  const deduped = deduplicateReferences(doc)
  const jd = SchemaRepresentation.toJsonSchemaDocument(deduped, options)
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
 * Deduplicates references in a Document: when multiple $ref keys share
 * the same base identifier (e.g. "X" and "X1") and their representations
 * are identical (by string fingerprint), the duplicates are collapsed into
 * the first entry found for that identifier.
 */
function deduplicateReferences(
  doc: SchemaRepresentation.Document
): SchemaRepresentation.Document {
  const refs = doc.references
  const refKeys = Object.keys(refs)
  if (refKeys.length === 0) return doc

  // Group references by base identifier (strip trailing digits added by gen())
  const identifierGroups = new Map<string, Array<{ key: string; fingerprint: string }>>()
  for (const key of refKeys) {
    const base = getBaseIdentifier(key)
    const fingerprint = Formatter.format(refs[key])
    const group = identifierGroups.get(base)
    if (group === undefined) {
      identifierGroups.set(base, [{ key, fingerprint }])
    } else {
      group.push({ key, fingerprint })
    }
  }

  // Build a mapping from duplicate keys to their canonical key
  const remapping = new Map<string, string>()
  for (const [, group] of identifierGroups) {
    const seen = new Map<string, string>() // fingerprint -> canonical key
    for (const entry of group) {
      const canonical = seen.get(entry.fingerprint)
      if (canonical !== undefined) {
        remapping.set(entry.key, canonical)
      } else {
        seen.set(entry.fingerprint, entry.key)
      }
    }
  }

  if (remapping.size === 0) return doc

  // Build new references, excluding duplicates
  const newRefs: Record<string, SchemaRepresentation.Representation> = {}
  for (const key of refKeys) {
    if (!remapping.has(key)) {
      newRefs[key] = refs[key]!
    }
  }

  // Rewrite $ref pointers throughout the document
  const newRepresentation = rewriteRefs(doc.representation, remapping)
  const rewrittenRefs: Record<string, SchemaRepresentation.Representation> = {}
  for (const [key, rep] of Object.entries(newRefs)) {
    rewrittenRefs[key] = rewriteRefs(rep, remapping)
  }

  return { representation: newRepresentation, references: rewrittenRefs }
}

/**
 * Extracts the base identifier from a reference key by stripping trailing
 * digits appended by the gen() function during fromASTs.
 * E.g. "X1" -> "X", "X" -> "X", "MyType2" -> "MyType"
 */
function getBaseIdentifier(key: string): string {
  const match = key.match(/^(.+?)(\d+)$/)
  return match ? match[1]! : key
}

/**
 * Recursively rewrites $ref pointers in a Representation tree.
 */
function rewriteRefs(
  rep: SchemaRepresentation.Representation,
  remapping: Map<string, string>
): SchemaRepresentation.Representation {
  switch (rep._tag) {
    case "Reference": {
      const target = remapping.get(rep.$ref)
      return target !== undefined ? { ...rep, $ref: target } : rep
    }
    case "Declaration":
      return {
        ...rep,
        typeParameters: rep.typeParameters.map((tp) => rewriteRefs(tp, remapping)),
        encodedSchema: rewriteRefs(rep.encodedSchema, remapping)
      }
    case "Suspend":
      return {
        ...rep,
        thunk: rewriteRefs(rep.thunk, remapping)
      }
    case "Arrays":
      return {
        ...rep,
        elements: rep.elements.map((e) => ({ ...e, type: rewriteRefs(e.type, remapping) })),
        rest: rep.rest.map((r) => rewriteRefs(r, remapping))
      }
    case "Objects":
      return {
        ...rep,
        propertySignatures: rep.propertySignatures.map((ps) => ({
          ...ps,
          type: rewriteRefs(ps.type, remapping)
        })),
        indexSignatures: rep.indexSignatures.map((is) => ({
          ...is,
          parameter: rewriteRefs(is.parameter, remapping),
          type: rewriteRefs(is.type, remapping)
        })),
        checks: rewriteChecks(rep.checks, remapping)
      }
    case "Union":
      return {
        ...rep,
        types: rep.types.map((t) => rewriteRefs(t, remapping))
      }
    case "TemplateLiteral":
      return {
        ...rep,
        parts: rep.parts.map((p) => rewriteRefs(p, remapping))
      }
    case "String": {
      if (rep.contentSchema !== undefined) {
        return {
          ...rep,
          contentSchema: rewriteRefs(rep.contentSchema, remapping)
        }
      }
      return rep
    }
    default:
      // Leaf nodes: Null, Undefined, Void, Never, Unknown, Any, Boolean,
      // Symbol, Number, BigInt, Literal, UniqueSymbol, ObjectKeyword, Enum
      return rep
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rewriteChecks<M>(
  checks: ReadonlyArray<SchemaRepresentation.Check<M>>,
  remapping: Map<string, string>
): ReadonlyArray<SchemaRepresentation.Check<M>> {
  return checks.map((c) => {
    switch (c._tag) {
      case "Filter": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = c.meta as any
        if (meta && meta._tag === "isPropertyNames" && meta.propertyNames) {
          return {
            ...c,
            meta: { ...meta, propertyNames: rewriteRefs(meta.propertyNames, remapping) }
          }
        }
        return c
      }
      case "FilterGroup":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ...c, checks: rewriteChecks(c.checks, remapping) as any }
    }
  })
}
