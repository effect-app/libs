/**
 * SpecialOpenApi — Deduplicates `components/schemas` entries in an OpenAPI spec.
 *
 * When `OpenApi.fromApi` generates the spec, different AST nodes sharing the
 * same identifier can produce duplicate entries (e.g. "X" and "X1") in
 * `components.schemas`. This module provides a transform function that
 * collapses those duplicates and rewrites all `$ref` pointers accordingly.
 *
 * Usage with the OpenApi `Transform` annotation:
 *
 * ```ts
 * import { OpenApi } from "effect/unstable"
 * import { deduplicateOpenApiSchemas } from "./SpecialOpenApi.js"
 *
 * const api = HttpApi.make("myApi")
 *   .pipe(HttpApi.annotateContext(OpenApi.annotations({ transform: deduplicateOpenApiSchemas })))
 * ```
 */

/**
 * Deduplicates `components.schemas` entries in an OpenAPI spec.
 *
 * Entries sharing the same base identifier (e.g. "X" and "X1") whose JSON
 * representations are identical are collapsed into a single canonical entry,
 * and all `$ref` pointers throughout the spec are rewritten to point to
 * the canonical key.
 *
 * Designed to be used as the `transform` option in `OpenApi.annotations`.
 */
export function deduplicateOpenApiSchemas(
  spec: Record<string, any>
): Record<string, any> {
  const components = spec.components as Record<string, any> | undefined
  if (!components) return spec
  const schemas = components.schemas as Record<string, any> | undefined
  if (!schemas) return spec

  const keys = Object.keys(schemas)
  if (keys.length === 0) return spec

  // Group keys by base identifier (strip trailing digits)
  const groups = new Map<string, Array<{ key: string; fingerprint: string }>>()
  for (const key of keys) {
    const base = getBaseIdentifier(key)
    const fingerprint = JSON.stringify(schemas[key])
    const group = groups.get(base)
    if (group === undefined) {
      groups.set(base, [{ key, fingerprint }])
    } else {
      group.push({ key, fingerprint })
    }
  }

  // Build remapping from duplicate keys to canonical keys
  const remapping = new Map<string, string>()
  for (const [, group] of groups) {
    if (group.length <= 1) continue
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

  if (remapping.size === 0) return spec

  // Build new schemas object without duplicates
  const newSchemas: Record<string, any> = {}
  for (const key of keys) {
    if (!remapping.has(key)) {
      newSchemas[key] = schemas[key]
    }
  }

  // Deep clone the spec, replace schemas, and rewrite all $ref pointers
  const newSpec = structuredClone(spec)
  newSpec.components.schemas = newSchemas
  rewriteRefs(newSpec, remapping)

  return newSpec
}

/**
 * Extracts the base identifier from a schema key by stripping trailing
 * digits appended by the gen() function.
 * E.g. "X1" -> "X", "X" -> "X", "MyType2" -> "MyType"
 */
function getBaseIdentifier(key: string): string {
  const match = key.match(/^(.+?)(\d+)$/)
  return match ? match[1] : key
}

/**
 * Recursively rewrites `$ref` values in a JSON object tree.
 * Mutates the object in-place (caller should pass a deep clone).
 */
function rewriteRefs(obj: any, remapping: Map<string, string>): void {
  if (obj === null || typeof obj !== "object") return

  if (Array.isArray(obj)) {
    for (const item of obj) {
      rewriteRefs(item, remapping)
    }
    return
  }

  if (typeof obj.$ref === "string") {
    // OpenAPI refs look like "#/components/schemas/X1"
    const prefix = "#/components/schemas/"
    if (obj.$ref.startsWith(prefix)) {
      const refKey = obj.$ref.slice(prefix.length)
      const canonical = remapping.get(refKey)
      if (canonical !== undefined) {
        obj.$ref = prefix + canonical
      }
    }
  }

  for (const value of Object.values(obj)) {
    rewriteRefs(value, remapping)
  }
}
