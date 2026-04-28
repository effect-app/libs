/* eslint-disable @typescript-eslint/no-explicit-any */
import generate from "@babel/generator"
import { parse } from "@babel/parser"
import type { Preset } from "eslint-plugin-codegen"
import * as fs from "fs"

function parseModule(code: string) {
  return parse(code, { sourceType: "module", plugins: ["typescript"] }) as any
}

// Detects `export class Foo` whose extends clause contains e.g. `Class<Foo,` or
// `S.TaggedClass<Foo,` — the second generic signals an Encoded override and marks
// this class as a model that needs a generated namespace block.
// We look at the text from `export class` up to the opening `{` of the class body
// (stopping at the next `export class` boundary) so the pattern works for multi-line
// extends expressions without bleeding into the next class declaration.
const baseClassWithEncodedRe = /(?:^|[\s.])(?:Class|TaggedClass|ErrorClass|TaggedErrorClass)\s*<\s*\w[\w.]*\s*,/
const opaqueWithEncodedRe = /(?:^|[\s.])Opaque\s*<\s*\w[\w.]*\s*,/
const contextOpaqueRe = /(?:^|[\s.])Context\s*\.\s*Opaque\s*</

function getExportedModelNames(code: string): Array<string> {
  const result: Array<string> = []
  const classRe = /(^|\n)\s*export\s+class\s+(\w+)/g
  const matches = Array.from(code.matchAll(classRe))
  for (const [index, match] of matches.entries()) {
    const name = match[2]!
    const start = match.index! + match[1]!.length
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
    ) {
      result.push(name)
    }
  }
  return result
}

function normalise(str: string) {
  try {
    return generate(
      parseModule(str)
    )
      .code
    // .replace(/'/g, `"`)
    // .replace(/\/index/g, "")
    // .replace(/([\n\s]+ \|)/g, " |").replaceAll(": |", ":")
    // .replaceAll(/[\s\n]+\|/g, " |")
    // .replaceAll("\n", ";")
    // .replaceAll(" ", "")
    // TODO: remove all \n and whitespace?
  } catch {
    return str
  }
}

export const model: Preset<{
  writeFullTypes?: boolean
}> = ({ meta }) => {
  try {
    const targetContent = fs.readFileSync(meta.filename).toString()

    const processed: string[] = []

    const sourcePath = meta.filename
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw Error(`Source path is not a file: ${sourcePath}`)
    }

    const them = []
    for (const modelName of getExportedModelNames(targetContent)) {
      if (processed.includes(modelName)) continue
      processed.push(modelName)

      them.push([
        `export namespace ${modelName} {`,
        `  export interface Encoded extends S.StructNestedEncoded<typeof ${modelName}> {}`,
        "}"
      ])
    }
    const expectedContent = [
      "//",
      `/* eslint-disable */`,
      ...them.flat().filter((x): x is string => !!x),
      `/* eslint-enable */`,
      "//"
    ]
      .join("\n")

    // do not re-emit in a different style, or a loop will occur
    if (normalise(meta.existingContent) === normalise(expectedContent)) {
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
