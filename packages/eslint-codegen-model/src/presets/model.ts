import * as fs from "fs"
import type { ModelTypeResolver } from "../shared/type-resolver.js"

// Detects `export class Foo` whose extends clause contains e.g. `Class<Foo,` or
// `S.TaggedClass<Foo,` — the second generic signals an Encoded override and marks
// this class as a model that needs a generated namespace block.
// We look at the text from `export class` up to the opening `{` of the class body
// (stopping at the next `export class` boundary) so the pattern works for multi-line
// extends expressions without bleeding into the next class declaration.
const baseClassWithEncodedRe = /(?:^|[\s.])(?:Class|TaggedClass|ErrorClass|TaggedErrorClass)\s*<\s*\w[\w.]*\s*,/
const opaqueWithEncodedRe = /(?:^|[\s.])Opaque\s*<\s*\w[\w.]*\s*,/
const opaqueFacadeRe = /(?:^|[\s.])OpaqueFacade(?:Class)?\s*</
const contextOpaqueRe = /(?:^|[\s.])Context\s*\.\s*Opaque\s*</

export function getExportedModelNames(code: string): Array<string> {
  const result: Array<string> = []
  const add = (name: string) => {
    if (!result.includes(name)) result.push(name)
  }
  const classRe = /(^|\n)\s*export\s+class\s+(\w+)/g
  const matches = Array.from(code.matchAll(classRe))
  for (const [index, match] of matches.entries()) {
    const name = match[2]!
    const start = match.index + match[1]!.length
    // Take up to the next `export class` or 500 chars, whichever comes first,
    // then trim further to only the extends clause (before the first `{`).
    const nextClass = matches[index + 1]?.index
    const rawWindow = code.slice(start, nextClass === undefined ? start + 500 : nextClass)
    // Only look at the part before the class body opens.
    const braceIdx = rawWindow.indexOf("{")
    const extendsWindow = braceIdx === -1 ? rawWindow : rawWindow.slice(0, braceIdx)
    if (
      baseClassWithEncodedRe.test(extendsWindow)
      || (opaqueWithEncodedRe.test(extendsWindow) && !contextOpaqueRe.test(extendsWindow))
      || opaqueFacadeRe.test(extendsWindow)
    ) {
      add(name)
    }
  }
  const facadeRe = /(^|\n)\s*export\s+const\s+(\w+)\s*:\s*\2\.Schema\s*=/g
  for (const match of code.matchAll(facadeRe)) {
    add(match[2]!)
  }
  return result
}

function normaliseLines(s: string): string {
  return s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n")
}

export type ModelOptions = {
  /**
   * Emit expanded literal `Encoded` interfaces (nested models referenced by name) instead of
   * `interface Encoded extends StructNestedEncoded<typeof X>`. Greatly reduces instantiation
   * on Encoded-touching consumers. Requires a type resolver (CLI only); without one (e.g. the
   * oxlint rule) static blocks are left untouched.
   */
  static?: boolean
  /**
   * With `static`, also emit a literal `Type` interface (decoded side); the class is
   * rewritten to `S.OpaqueType<X.Type, X.Encoded>` so the instance uses it.
   */
  type?: boolean
  /**
   * With `static`, also emit a literal `Make` interface (make-input side); the class is
   * rewritten to `S.OpaqueShape<X.Type, X.Encoded, X.Make>`. Implies `type`.
   */
  make?: boolean
  /**
   * With `static`, emit a shallow exported facade for private model classes. Implies
   * `type` and `make`; the CLI rewrites `export class X` into private `class _X`
   * plus `export class X extends S.OpaqueFacadeClass<X, X.Encoded, X.Make, X.DecodingServices, X.EncodingServices>()(_X) {}`.
   */
  facade?: boolean
  /** @deprecated unused */
  writeFullTypes?: boolean
}

export function model(
  { meta, options }: { meta: { filename: string; existingContent: string }; options: ModelOptions },
  context?: unknown,
  resolver?: ModelTypeResolver
): string {
  try {
    const targetContent = typeof context === "string" && context.length > 0
      ? context
      : fs.readFileSync(meta.filename).toString()

    const modelNames: Array<string> = []
    const seen = new Set<string>()
    for (const modelName of getExportedModelNames(targetContent)) {
      if (seen.has(modelName)) continue
      seen.add(modelName)
      modelNames.push(modelName)
    }

    let expectedContent: string
    if (options?.static || options?.facade) {
      if (!resolver) {
        // No type checker available (e.g. oxlint). Leave the block as-is so we don't
        // clobber CLI-generated static interfaces with the conditional form.
        return meta.existingContent
      }
      const block = resolver.generate(meta.filename, modelNames, {
        facade: options.facade ?? false,
        make: options.facade || (options.make ?? false),
        type: options.facade || options.type || options.make || false
      })
      if (block === null) {
        // Could not resolve (file outside program, etc.) — leave existing content.
        return meta.existingContent
      }
      expectedContent = ["//", block, "//"].join("\n")
    } else {
      const them = modelNames.map((modelName) => [
        `export namespace ${modelName} {`,
        `  export interface Encoded extends S.StructNestedEncoded<typeof ${modelName}> {}`,
        "}"
      ])
      expectedContent = ["//", ...them.flat(), "//"].join("\n")
    }

    // Fast path: whitespace-normalised comparison (avoids AST parse)
    if (normaliseLines(meta.existingContent) === normaliseLines(expectedContent)) {
      return meta.existingContent
    }
    return expectedContent
  } catch (e) {
    return (
      "/** Got exception: "
      + ("stack" in (e as any) ? (e as any).stack : "")
      + JSON.stringify(e)
      + "*/"
    )
  }
}
