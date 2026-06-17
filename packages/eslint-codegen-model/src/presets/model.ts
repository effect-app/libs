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
      // base mode: `export class X extends __X` (facade lives on the generated `__X`)
      || new RegExp(`extends\\s+__${name}\\b`).test(extendsWindow)
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

// The extends-clause text of a model's defining class — checks the private `_X`
// (post-rewrite) first, then the exported `X` (pre-rewrite / already-facade).
function modelExtendsWindow(code: string, name: string): string | null {
  // `class __X` first: base mode (`export class X extends __X`) where the facade
  // lives on the generated base `class __X extends OpaqueFacade<...>()(_X)`.
  for (const decl of [`class __${name}`, `class _${name}`, `export class ${name}`, `class ${name}`]) {
    const re = new RegExp(`(^|\\n)\\s*${decl.replace(/[$]/g, "\\$&")}\\b`)
    const m = re.exec(code)
    if (!m) continue
    const start = m.index + m[1]!.length
    const window = code.slice(start, start + 500)
    const braceIdx = window.indexOf("{")
    return braceIdx === -1 ? window : window.slice(0, braceIdx)
  }
  return null
}

// Models that can be turned into a shallow facade: those whose underlying schema
// is `S.Opaque(...)` (or already an `OpaqueFacade`). `Class`/`TaggedClass`/etc.
// models are nominal (and may carry instance methods) — leave them standard.
export function getFacadeableModelNames(code: string): Array<string> {
  return getExportedModelNames(code).filter((name) => {
    const w = modelExtendsWindow(code, name)
    if (w === null) return false
    if (baseClassWithEncodedRe.test(w)) return false
    return opaqueFacadeRe.test(w) || (/(?:^|[\s.])Opaque\s*</.test(w) && !contextOpaqueRe.test(w))
  })
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
   * plus `export class X extends S.OpaqueFacade<X, X.Encoded, X.Make, X.DecodingServices, X.EncodingServices>()(_X) {}`.
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
    // Any facade option (static/type/make/facade) needs the type checker. Without a
    // resolver (e.g. the oxlint rule, no checker) leave the block untouched so we never
    // revert CLI-generated static Encoded/Type/Make interfaces to the conditional form.
    const needsResolver = !!(options?.static || options?.type || options?.make || options?.facade)
    if (needsResolver) {
      if (!resolver) {
        return meta.existingContent
      }
      // In facade mode, only Opaque-struct models become facades; Class-based
      // models (nominal, may carry methods) keep the standard namespace so a
      // mixed file still converts its facade-able models.
      const facadeable = options.facade ? new Set(getFacadeableModelNames(targetContent)) : null
      const resolveNames = facadeable ? modelNames.filter((n) => facadeable.has(n)) : modelNames
      const standardNames = facadeable ? modelNames.filter((n) => !facadeable.has(n)) : []
      const block = resolveNames.length > 0
        ? resolver.generate(meta.filename, resolveNames, {
          facade: options.facade ?? false,
          make: options.facade || (options.make ?? false),
          type: options.facade || options.type || options.make || false
        })
        : ""
      if (block === null) {
        // Could not resolve (file outside program, etc.) — leave existing content.
        return meta.existingContent
      }
      const standardBlock = standardNames
        .map((n) =>
          `export namespace ${n} {\n  export interface Encoded extends S.StructNestedEncoded<typeof ${n}> {}\n}`
        )
        .join("\n")
      expectedContent = ["//", [block, standardBlock].filter((s) => s.length > 0).join("\n"), "//"].join("\n")
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
