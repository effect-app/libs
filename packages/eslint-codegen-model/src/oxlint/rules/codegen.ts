// @ts-expect-error oxlint@1.61.0 declares CreateRule but does not export it.
import * as fs from "node:fs"
import * as path from "node:path"
import type { CreateRule } from "oxlint/plugins-dev"
import { applyDefaults, type BlockOptions, blockRe, type CodegenDefaults, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "../../shared/codegen-block.ts"
import { createNativeModelTypeResolver } from "../../shared/native-type-resolver.ts"
import type { ModelTypeResolver } from "../../shared/type-resolver.ts"

/** Nearest `tsconfig.json` walking up from `from`, or null. */
function findNearestTsconfig(from: string): string | null {
  let dir = path.dirname(from)
  for (;;) {
    const candidate = path.join(dir, "tsconfig.json")
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Editor/CI type-aware resolver, opt-in via `TSGOLINT_CODEGEN_BIN`. When set,
 * the oxlint codegen rule resolves `static`/`facade` model blocks through the
 * tsgo fork -- so facade interfaces stay live in the editor without running the
 * CLI. Without the env var the rule keeps its text-only behaviour (no checker,
 * static/facade blocks left untouched). Cached per tsconfig per process.
 */
const nativeResolvers = new Map<string, ModelTypeResolver | null>()
function nativeResolverFor(filename: string): ModelTypeResolver | undefined {
  // Native (tsgo) is the default: the binary ships as the `oxlint-tsgolint`
  // drop-in, and the resolver is lazy (no binary work until a static/facade
  // block actually calls it). Set `TSGOLINT_CODEGEN_OFF` to fall back to
  // text-only (static/facade blocks left untouched). `TSGOLINT_CODEGEN_BIN`
  // overrides the binary path.
  if (process.env["TSGOLINT_CODEGEN_OFF"]) return undefined
  const tsconfigPath = findNearestTsconfig(filename)
  if (!tsconfigPath) return undefined
  if (!nativeResolvers.has(tsconfigPath)) {
    try {
      nativeResolvers.set(tsconfigPath, createNativeModelTypeResolver({ tsconfigPath }))
    } catch {
      nativeResolvers.set(tsconfigPath, null)
    }
  }
  return nativeResolvers.get(tsconfigPath) ?? undefined
}

type RuleContext = {
  sourceCode: {
    getText: () => string
  }
  physicalFilename: string
  options: ReadonlyArray<unknown>
  report: (diagnostic: {
    node: RuleNode
    message: string
    fix: (fixer: RuleFixer) => { range: [number, number]; text: string }
  }) => void
}

type RuleNode = {
  start: number
  end: number
  range: [number, number]
}

type RuleFixer = {
  replaceTextRange: (range: [number, number], text: string) => { range: [number, number]; text: string }
}

const codegenRule: CreateRule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    schema: [{
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: true
      }
    }],
    docs: {
      description: "Ensure codegen blocks are up to date"
    }
  },
  create(context: RuleContext) {
    const defaults = (context.options[0] ?? undefined) as CodegenDefaults | undefined
    return {
      Program(program: RuleNode) {
        const source = context.sourceCode.getText()
        const filename = context.physicalFilename
        const resolver = nativeResolverFor(filename)

        // Create a fresh regex instance per Program visit to avoid shared lastIndex state
        const re = new RegExp(blockRe.source, blockRe.flags)
        let match: RegExpExecArray | null

        while ((match = re.exec(source)) !== null) {
          const [fullMatch, indent = "", rawOptions = "", body = "", endIndent = ""] = match
          const matchStart = match.index
          const matchEnd = match.index + fullMatch.length

          let options: BlockOptions
          try {
            options = applyDefaults(parseBlockOptions(rawOptions), defaults)
          } catch {
            continue
          }

          const existingContent = trimTrailingNewline(body)
          let generatedContent: string
          try {
            generatedContent = trimTrailingNewline(
              normaliseGeneratedContent(
                options,
                filename,
                renderPreset(options, { filename, existingContent }, source, resolver)
              )
            )
          } catch {
            continue
          }

          const nextBody = generatedContent.length > 0 ? `${indentBlock(generatedContent, indent)}\n` : ""
          const replacement = `${indent}// codegen:start ${rawOptions}\n${nextBody}${endIndent}// codegen:end`

          if (replacement !== fullMatch) {
            context.report({
              node: program,
              message: `codegen block with preset "${options.preset}" is stale`,
              fix(fixer: RuleFixer) {
                return fixer.replaceTextRange([matchStart, matchEnd], replacement)
              }
            })
          }
        }
      }
    }
  }
}

export default codegenRule
