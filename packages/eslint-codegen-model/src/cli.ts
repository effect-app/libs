#!/usr/bin/env node
import * as fs from "node:fs"
import * as path from "node:path"

import glob from "glob"

import { applyDefaults, blockRe, type CodegenDefaults, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js"
import { getExportedModelNames } from "./presets/model.js"
import { createModelTypeResolver, type ModelTypeResolver } from "./shared/type-resolver.js"

const CONFIG_FILENAMES = ["codegen.config.json"]

function loadConfig(cwd: string, explicit?: string): CodegenDefaults | undefined {
  const candidates = explicit ? [path.resolve(cwd, explicit)] : CONFIG_FILENAMES.map((f) => path.join(cwd, f))
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"))
      return parsed as CodegenDefaults
    }
  }
  if (explicit) {
    throw new Error(`Config not found: ${explicit}`)
  }
  return undefined
}

const modelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b/
const staticTypeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b[^}]*\btype:\s*true\b/
const staticMakeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b[^}]*\bmake:\s*true\b/
const facadeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bfacade:\s*true\b/

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

type CtorMode = "plain" | "type" | "make"

/**
 * Keep each model's `Opaque` base-class clause in sync with the block mode (idempotent):
 * - make → `S.OpaqueShape<X.Type, X.Encoded, X.Make>`
 * - type → `S.OpaqueType<X.Type, X.Encoded>`
 * - plain → `S.Opaque<X, X.Encoded>` (revert)
 *
 * Only `Opaque`-family clauses for the model's own `Self`/`Encoded` are touched (matches
 * `<X|X.Type, X.Encoded[, X.Make]>`); `Class`/`TaggedClass` models are left untouched.
 */
function syncCtor(source: string, modelNames: ReadonlyArray<string>, mode: CtorMode): string {
  let out = source
  for (const name of modelNames) {
    const n = escapeRe(name)
    const re = new RegExp(
      `((?:[A-Za-z_$][\\w$]*\\.)?)(?:Opaque|OpaqueType|OpaqueShape)<\\s*${n}(?:\\.Type)?\\s*,\\s*${n}\\.Encoded(?:\\s*,\\s*${n}\\.Make)?\\s*>`,
      "g"
    )
    const target = mode === "make"
      ? `$1OpaqueShape<${name}.Type, ${name}.Encoded, ${name}.Make>`
      : mode === "type"
      ? `$1OpaqueType<${name}.Type, ${name}.Encoded>`
      : `$1Opaque<${name}, ${name}.Encoded>`
    out = out.replace(re, target)
  }
  return out
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0
  let quote: "\"" | "'" | "`" | undefined
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = openIndex; index < source.length; index++) {
    const char = source[index]!
    const next = source[index + 1]

    if (lineComment) {
      if (char === "\n") lineComment = false
      continue
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = undefined
      }
      continue
    }

    if (char === "/" && next === "/") {
      lineComment = true
      index++
      continue
    }
    if (char === "/" && next === "*") {
      blockComment = true
      index++
      continue
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "{") {
      depth++
      continue
    }
    if (char === "}") {
      depth--
      if (depth === 0) return index
    }
  }

  return -1
}

function findClassBodyOpen(source: string, start: number): number {
  let parenDepth = 0
  let bracketDepth = 0
  let quote: "\"" | "'" | "`" | undefined
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = start; index < source.length; index++) {
    const char = source[index]!
    const next = source[index + 1]

    if (lineComment) {
      if (char === "\n") lineComment = false
      continue
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = undefined
      }
      continue
    }

    if (char === "/" && next === "/") {
      lineComment = true
      index++
      continue
    }
    if (char === "/" && next === "*") {
      blockComment = true
      index++
      continue
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "(") {
      parenDepth++
      continue
    }
    if (char === ")") {
      parenDepth--
      continue
    }
    if (char === "[") {
      bracketDepth++
      continue
    }
    if (char === "]") {
      bracketDepth--
      continue
    }
    if (char === "{" && parenDepth === 0 && bracketDepth === 0) {
      return index
    }
  }

  return -1
}

function findClassEnd(source: string, start: number): number {
  const openIndex = findClassBodyOpen(source, start)
  if (openIndex === -1) return -1
  const closeIndex = findMatchingBrace(source, openIndex)
  return closeIndex === -1 ? -1 : closeIndex + 1
}

function modelSchemaPrefix(classText: string): string {
  const match = /\bextends\s+((?:[A-Za-z_$][\w$]*\.)?)(?:Opaque|OpaqueType|OpaqueShape)\s*</.exec(classText)
  return match?.[1] ?? "S."
}

function schemaName(prefix: string): string {
  return prefix.endsWith(".") ? prefix.slice(0, -1) : prefix
}

function schemaOption(prefix: string): string {
  const name = schemaName(prefix)
  return name.length === 0 ? `, schema: ""` : `, schema: ${name}`
}

function syncFacadeSourceCtor(classText: string, name: string): string {
  const n = escapeRe(name)
  const re = new RegExp(
    `((?:[A-Za-z_$][\\w$]*\\.)?)(?:Opaque|OpaqueType|OpaqueShape)<\\s*(?:${n}|_${n})(?:\\.Type)?\\s*(?:,\\s*(?:${n}|_${n})\\.Encoded(?:\\s*,\\s*(?:${n}|_${n})\\.Make)?)?\\s*>`,
    "g"
  )
  return classText.replace(re, `$1Opaque<_${name}>`)
}

function facadeClassLine(name: string, prefix: string): string {
  return `export class ${name} extends ${prefix}OpaqueFacadeClass<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(_${name}) {}`
}

function syncFacade(source: string, modelNames: ReadonlyArray<string>, enabled: boolean): string {
  let out = source
  for (const name of modelNames) {
    const n = escapeRe(name)
    if (enabled) {
      const existingClass = new RegExp(`(^|\\n)\\s*export\\s+class\\s+${n}\\s+extends\\s+(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade(?:Class)?\\s*<`)
      const existingConst = new RegExp(`(^|\\n)\\s*export\\s+const\\s+${n}\\s*:\\s*${n}\\.Schema\\s*=`)
      if (existingClass.test(out) || existingConst.test(out)) {
        out = out.replace(
          new RegExp(
            `(OpaqueFacade(?:Class)?<\\s*)${n}(?:\\.Type)?(\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make)(?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?(\\s*>)`,
            "g"
          ),
          `$1${name}$2, ${name}.DecodingServices, ${name}.EncodingServices$3`
        )
        const privateClassRe = new RegExp(`(^|\\n)(\\s*)class\\s+_${n}\\b`)
        const privateMatch = privateClassRe.exec(out)
        if (privateMatch) {
          const start = privateMatch.index + privateMatch[1]!.length
          const end = findClassEnd(out, start)
          if (end !== -1) {
            out = `${out.slice(0, start)}${syncFacadeSourceCtor(out.slice(start, end), name)}${out.slice(end)}`
          }
        }
        const facadeBlock = new RegExp(`// codegen:start[^\\n]*\\{[^}]*\\bpreset:\\s*modelFacade\\b[^}]*\\bclassName:\\s*_${n}\\b[^}]*\\}[\\s\\S]*?export\\s+(?:const|class)\\s+${n}\\b`)
        if (!facadeBlock.test(out)) {
          const facadeLine = new RegExp(
            `(^|\\n)([ \\t]*)export\\s+const\\s+${n}\\s*:\\s*${n}\\.Schema\\s*=\\s*((?:(?:[A-Za-z_$][\\w$]*\\.)?)OpaqueFacade<\\s*${n}\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make(?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?\\s*>\\(\\)\\(\\s*_${n}\\s*\\))`
          )
          out = out.replace(facadeLine, (_match, lineStart: string, indent: string, expression: string) => {
            const prefix = /^((?:[A-Za-z_$][\w$]*\.)?)OpaqueFacade/.exec(expression)?.[1] ?? ""
            return [
              `${lineStart}${indent}// codegen:start {preset: modelFacade, className: _${name}${schemaOption(prefix)}}`,
              `${indent}${facadeClassLine(name, prefix)}`,
              `${indent}// codegen:end`
            ].join("\n")
          })
        }
        continue
      }

      const classRe = new RegExp(`(^|\\n)(\\s*)export\\s+class\\s+${n}\\b`)
      const match = classRe.exec(out)
      if (!match) continue
      const start = match.index + match[1]!.length
      const end = findClassEnd(out, start)
      if (end === -1) continue

      const classText = out.slice(start, end)
      const indent = match[2]!
      const prefix = modelSchemaPrefix(classText)
      const privateClass = syncFacadeSourceCtor(
        classText.replace(new RegExp(`^${indent}export\\s+class\\s+${n}\\b`), `${indent}class _${name}`),
        name
      )
      const facade = [
        `${indent}// codegen:start {preset: modelFacade, className: _${name}${schemaOption(prefix)}}`,
        `${indent}${facadeClassLine(name, prefix)}`,
        `${indent}// codegen:end`
      ].join("\n")
      out = `${out.slice(0, start)}${privateClass}\n${facade}${out.slice(end)}`
    } else {
      const classRe = new RegExp(`(^|\\n)(\\s*)class\\s+_${n}\\b`)
      const match = classRe.exec(out)
      if (!match) continue
      const start = match.index + match[1]!.length
      const end = findClassEnd(out, start)
      if (end === -1) continue

      const classText = out.slice(start, end)
      const indent = match[2]!
      const exportedClass = classText.replace(new RegExp(`^${indent}class\\s+_${n}\\b`), `${indent}export class ${name}`)
      const facadeRe = new RegExp(`\\n${indent}(?:// codegen:start[^\\n]*\\{[^}]*\\bpreset:\\s*modelFacade\\b[^}]*\\}\\n)?${indent}export\\s+(?:const\\s+${n}\\s*:\\s*${n}\\.Schema\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade<\\s*${n}(?:\\.Type)?\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make(?:\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices)?\\s*>\\(\\)\\(\\s*_${n}\\s*\\)|class\\s+${n}\\s+extends\\s+(?:[A-Za-z_$][\\w$]*\\.)?OpaqueFacade(?:Class)?<\\s*${n}\\s*,\\s*${n}\\.Encoded\\s*,\\s*${n}\\.Make\\s*,\\s*${n}\\.DecodingServices\\s*,\\s*${n}\\.EncodingServices\\s*>\\(\\)\\(\\s*_${n}\\s*\\)\\s*\\{\\})(?:\\n${indent}// codegen:end)?`)
      out = `${out.slice(0, start)}${exportedClass}${out.slice(end)}`.replace(facadeRe, "")
    }
  }
  return out
}

function syncModelSource(source: string): string {
  // Sync each model's Opaque ctor to the block mode (make → OpaqueShape, type → OpaqueType,
  // else plain Opaque). Done outside codegen blocks, on the class declarations. Only for files
  // that actually contain a model codegen block, so manual OpaqueType/Shape usage is untouched.
  if (modelBlockRe.test(source)) {
    const facade = facadeModelBlockRe.test(source)
    const mode: CtorMode = staticMakeModelBlockRe.test(source)
      ? "make"
      : staticTypeModelBlockRe.test(source)
      ? "type"
      : "plain"
    const modelNames = getExportedModelNames(source)
    return facade ? syncFacade(source, modelNames, true) : syncCtor(syncFacade(source, modelNames, false), modelNames, mode)
  }
  return source
}

function updateFile(filePath: string, source: string, defaults?: CodegenDefaults, resolver?: ModelTypeResolver): boolean {
  let changed = false

  const synced = syncModelSource(source)
  if (synced !== source) {
    changed = true
    source = synced
  }

  const next = source.replace(
    blockRe,
    (_match, indent: string, rawOptions: string, body: string, endIndent: string) => {
      const options = applyDefaults(parseBlockOptions(rawOptions), defaults)
      const existingContent = trimTrailingNewline(body)
      const generatedContent = trimTrailingNewline(
        normaliseGeneratedContent(
          options,
          filePath,
          renderPreset(options, { filename: filePath, existingContent }, source, resolver)
        )
      )

      const nextBody = generatedContent.length > 0 ? `${indentBlock(generatedContent, indent)}\n` : ""
      const replacement = `${indent}// codegen:start ${rawOptions}\n${nextBody}${endIndent}// codegen:end`

      if (replacement !== _match) {
        changed = true
      }

      return replacement
    }
  )

  if (next !== source) {
    fs.writeFileSync(filePath, next)
  }

  return changed
}

interface ParsedArgs {
  files: Array<string>
  help: boolean
  config?: string
  tsconfig?: string
}

function parseArgs(args: ReadonlyArray<string>): ParsedArgs {
  const files: Array<string> = []
  let config: string | undefined
  let tsconfig: string | undefined

  for (let index = 0; index < args.length; index++) {
    const part = args[index]!
    if (part === "--help" || part === "-h") {
      return { files, help: true }
    }
    if (part === "--file") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("Missing value for --file")
      }
      files.push(path.resolve(process.cwd(), next))
      index++
      continue
    }
    if (part === "--config") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("Missing value for --config")
      }
      config = next
      index++
      continue
    }
    if (part === "--tsconfig") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("Missing value for --tsconfig")
      }
      tsconfig = path.resolve(process.cwd(), next)
      index++
      continue
    }
    throw new Error(`Unknown argument: ${part}`)
  }

  const result: ParsedArgs = { files, help: false }
  if (config !== undefined) result.config = config
  if (tsconfig !== undefined) result.tsconfig = tsconfig
  return result
}

// A model block requests type-checker-backed literal interfaces via `static: true`
// or a shallow facade.
const staticModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\b(?:static|facade):\s*true\b/

function defaultFiles(): Array<string> {
  return glob
    .sync("**/*.{ts,tsx,mts,cts}", {
      cwd: process.cwd(),
      nodir: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**"
      ]
    })
    .map((filePath) => path.resolve(process.cwd(), filePath))
}

function findNearestTsconfig(fromDir: string): string | undefined {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, "tsconfig.json")
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function run() {
  const { files, help, config, tsconfig } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log("Usage: effect-app-codegen [--file <path>]... [--config <path>] [--tsconfig <path>]")
    console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.")
    console.log(`Loads ${CONFIG_FILENAMES.join(", ")} from cwd when present; --config overrides.`)
    console.log("--tsconfig enables `static` model blocks (type-checker-backed literal Encoded/Type).")
    return
  }

  const defaults = loadConfig(process.cwd(), config)
  const targetFiles = files.length > 0 ? files : defaultFiles()
  const updated: Array<string> = []
  const untouched: Array<string> = []

  // Build the type resolver lazily, only if some target file requests static model blocks.
  const candidateFiles = targetFiles.filter((f) => fs.existsSync(f) && fs.statSync(f).isFile())
  const staticFiles = candidateFiles.filter((f) => staticModelBlockRe.test(fs.readFileSync(f, "utf8")))
  const preSynced = new Set<string>()
  for (const filePath of staticFiles) {
    const source = fs.readFileSync(filePath, "utf8")
    const synced = syncModelSource(source)
    if (synced !== source) {
      fs.writeFileSync(filePath, synced)
      preSynced.add(filePath)
    }
  }
  let resolver: ModelTypeResolver | undefined
  if (staticFiles.length > 0) {
    const tsconfigPath = tsconfig ?? findNearestTsconfig(path.dirname(staticFiles[0]!))
    if (!tsconfigPath) {
      throw new Error("static model blocks require a tsconfig; pass --tsconfig <path>")
    }
    resolver = createModelTypeResolver({ tsconfigPath, files: staticFiles })
  }

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`File not found: ${filePath}`)
    }

    const source = fs.readFileSync(filePath, "utf8")
    if (!source.includes("// codegen:start")) {
      continue
    }

    if (updateFile(filePath, source, defaults, resolver)) {
      updated.push(path.relative(process.cwd(), filePath))
    } else if (preSynced.has(filePath)) {
      updated.push(path.relative(process.cwd(), filePath))
    } else {
      untouched.push(path.relative(process.cwd(), filePath))
    }
  }

  console.log(`codegen: ${updated.length} updated, ${untouched.length} unchanged`)
  for (const filePath of updated) {
    console.log(`updated ${filePath}`)
  }
}

try {
  run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}
