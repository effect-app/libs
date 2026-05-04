// @ts-expect-error oxlint@1.61.0 declares CreateRule but does not export it.
import type { CreateRule } from "oxlint/plugins-dev"
import {
  blockRe,
  indentBlock,
  normaliseGeneratedContent,
  parseBlockOptions,
  renderPreset,
  trimTrailingNewline,
  type BlockOptions
} from "../../shared/codegen-block.js"

type RuleContext = {
  sourceCode: {
    getText: () => string
  }
  physicalFilename: string
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
    docs: {
      description: "Ensure codegen blocks are up to date"
    }
  },
  create(context: RuleContext) {
    return {
      Program(program: RuleNode) {
        const source = context.sourceCode.getText()
        const filename = context.physicalFilename

        // Create a fresh regex instance per Program visit to avoid shared lastIndex state
        const re = new RegExp(blockRe.source, blockRe.flags)
        let match: RegExpExecArray | null

        while ((match = re.exec(source)) !== null) {
          const [fullMatch, indent = "", rawOptions = "", body = "", endIndent = ""] = match
          const matchStart = match.index
          const matchEnd = match.index + fullMatch.length

          let options: BlockOptions
          try {
            options = parseBlockOptions(rawOptions)
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
                renderPreset(options, { filename, existingContent }, source)
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
