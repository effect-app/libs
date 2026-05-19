import glob from "glob"
import * as path from "path"
import { normaliseModuleForBarrel } from "../normalise.js"

type PresetFn<T = Record<string, unknown>> = (args: {
  meta: { filename: string; existingContent: string }
  options: T
}, context?: unknown) => string

function last<T>(list: readonly T[]): T | undefined {
  return list[list.length - 1]
}

function splitWords(s: string): string[] {
  return s
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 0)
}

function toCamelCase(s: string): string {
  return splitWords(s)
    .map((word, i) => {
      const lower = word.toLowerCase()
      return i === 0 ? lower : lower[0]!.toUpperCase() + lower.slice(1)
    })
    .join("")
}

function toPascalCase(s: string): string {
  return splitWords(s)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/**
 * Bundle several modules into a single convenient one.
 *
 * @example
 * // codegen:start {preset: barrel, include: some/path/*.ts, exclude: some/path/*util.ts}
 * export * from './some/path/module-a'
 * export * from './some/path/module-b'
 * export * from './some/path/module-c'
 * // codegen:end
 *
 * @param include
 * [optional] If specified, the barrel will only include file paths that match this glob pattern
 * @param exclude
 * [optional] If specified, the barrel will exclude file paths that match these glob patterns
 * @param import
 * [optional] If specified, matching files will be imported and re-exported rather than directly exported
 * with `export * from './xyz'`. Use `import: star` for `import * as xyz from './xyz'` style imports.
 * Use `import: default` for `import xyz from './xyz'` style imports.
 * @param export
 * [optional] Only valid if the import style has been specified (either `import: star` or `import: default`).
 * If specified, matching modules will be bundled into a const or default export based on this name. If set
 * to `{name: someName, keys: path}` the relative file paths will be used as keys. Otherwise the file paths
 * will be camel-cased to make them valid js identifiers.
 * @param importExtension
 * [optional] Extension used on the emitted import/export specifiers. Defaults to `.ts`. Set to `.js` (or
 * empty string) to emit unsuffixed/TS specifiers. Configurable per block, or globally via the rule option
 * `{ barrel: { importExtension: ".js" } }` / `codegen.config.json`.
 */
export const barrel: PresetFn<{
  include?: string
  exclude?: string | string[]
  import?: "default" | "star"
  export?:
    | string
    | { name: string; keys: "path" | "camelCase" }
    | { as: "PascalCase"; postfix?: string }
  nodir?: boolean
  modulegen?: boolean
  importExtension?: string
}> = ({ meta, options: opts }) => {
  const cwd = path.dirname(meta.filename)
  const nodir = opts.nodir ?? true
  const modulegen = opts.modulegen ?? false
  const importExt = opts.importExtension ?? ".ts"

  const ext = meta.filename.split(".").slice(-1)[0]
  const pattern = opts.include || `*.${ext}`

  const relativeFiles = glob
    .sync(pattern, { cwd, ignore: opts.exclude, nodir })
    .filter((f) => path.resolve(cwd, f) !== path.resolve(meta.filename))
    .map((f) => `./${f}`.replace(/(\.\/)+\./g, "."))
    .filter((file) =>
      nodir
        ? [".js", ".mjs", ".ts", ".tsx"].includes(path.extname(file))
        : true
    )
    .map((f) => {
      const isDir = f.endsWith("/")
      const cleaned = f.replace(/\.\w+$/, "").replace(/\/$/, "")
      return isDir ? `${cleaned}/index` : cleaned
    })

  let expectedContent: string

  if (opts.import === undefined) {
    const exportOpt = opts.export
    if (
      typeof exportOpt === "object"
      && exportOpt !== null
      && "as" in exportOpt
      && exportOpt.as === "PascalCase"
    ) {
      expectedContent = relativeFiles
        .map(
          (f) =>
            `export * as ${toPascalCase(last(f.split("/"))!)}${
              "postfix" in exportOpt ? exportOpt.postfix : ""
            } from "${f}${importExt}"`
        )
        .join("\n")
    } else {
      expectedContent = relativeFiles.map((f) => `export * from "${f}${importExt}"`).join("\n")
    }
  } else {
    const importPrefix = opts.import === "default" ? "" : "* as "
    const rawIdentifiers = relativeFiles.map((f) => ({
      file: f,
      identifier: toCamelCase(modulegen ? last(f.split("/"))! : f)
        .replace(/^([^a-z])/, "_$1")
        .replace(/([\^/])Index$/, "$1")
    }))

    const grouped = rawIdentifiers.reduce<Record<string, Array<{ file: string; identifier: string }>>>(
      (acc, info) => {
        ;(acc[info.identifier] ??= []).push(info)
        return acc
      },
      {}
    )
    const withIdentifiers = Object.values(grouped).flatMap((group) =>
      group.length === 1
        ? group
        : group.map((info, i) => ({ ...info, identifier: `${info.identifier}_${i + 1}` }))
    )

    const imports = withIdentifiers
      .map((i) => `import ${importPrefix}${i.identifier} from "${i.file}${importExt}"`)
      .join("\n")

    const exportOpt = opts.export
    const exportProps = modulegen
      ? []
      : typeof exportOpt === "object"
          && exportOpt !== null
          && "keys" in exportOpt
          && (exportOpt as { name: string; keys: "path" | "camelCase" }).keys === "path"
      ? withIdentifiers.map((i) => `${JSON.stringify(i.file)}: ${i.identifier}`)
      : withIdentifiers.map((i) => i.identifier)

    let exportPrefix: string
    if (exportOpt === undefined) {
      exportPrefix = "export"
    } else if (exportOpt === "default") {
      exportPrefix = "export default"
    } else if (typeof exportOpt === "object" && "name" in exportOpt && exportOpt.name === "default") {
      exportPrefix = "export default"
    } else if (typeof exportOpt === "string") {
      exportPrefix = `export const ${exportOpt} =`
    } else if (typeof exportOpt === "object" && "name" in exportOpt) {
      exportPrefix = `export const ${exportOpt.name} =`
    } else {
      exportPrefix = ""
    }

    const exports = exportProps.join(",\n ")

    const moduleGen = withIdentifiers
      .map((i) => {
        const up = `${i.identifier[0]!.toUpperCase()}${i.identifier.slice(1)}`
        return `export interface ${up} extends Id<typeof ${i.identifier}> {}
export const ${up}: ${up} = ${i.identifier}`
      })
      .join("\n")

    const exportss = modulegen ? "" : `\n${exportPrefix} {\n ${exports}\n}`
    expectedContent = `${imports}\n${exportss}\n${
      modulegen && moduleGen
        ? "type Id<T> = T\n/* eslint-disable @typescript-eslint/no-empty-object-type */\n\n" + moduleGen
        : ""
    }`
  }

  // Fast path: exact match after trimming (avoids AST parse)
  if (expectedContent.trim() === meta.existingContent.trim()) {
    return meta.existingContent
  }

  // Slow path: AST-based comparison (handles /index equivalence etc.)
  try {
    if (
      normaliseModuleForBarrel(expectedContent, meta.filename)
        === normaliseModuleForBarrel(meta.existingContent, meta.filename)
    ) {
      return meta.existingContent
    }
  } catch {}

  return expectedContent
}
