import yaml from "js-yaml"
// @ts-expect-error oxlint@1.61.0 declares CreateRule but does not export it.
import type { CreateRule } from "oxlint/plugins-dev"
import { barrel } from "../../presets/barrel.js"
import { meta as metaPreset } from "../../presets/meta.js"
import { model } from "../../presets/model.js"

type BlockOptions = Record<string, unknown> & {
  preset: string
}

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

const blockRe = /^([ \t]*)\/\/ codegen:start[ \t]*(\{.*\})[ \t]*$\n?([\s\S]*?)^([ \t]*)\/\/ codegen:end[ \t]*$/gm

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function isBlockOptions(input: unknown): input is BlockOptions {
  return isRecord(input) && typeof input["preset"] === "string"
}

function parseBlockOptions(input: string): BlockOptions {
  const parsed = yaml.load(input)
  if (!isBlockOptions(parsed)) {
    throw new Error(`Invalid codegen options: ${input}`)
  }
  return parsed
}

function trimTrailingNewline(input: string): string {
  return input.endsWith("\n") ? input.slice(0, -1) : input
}

function isTypeScriptSource(filePath: string): boolean {
  return /\.[cm]?tsx?$/.test(filePath)
}

function shouldStripJsExtensions(options: BlockOptions, filePath: string): boolean {
  return options.preset === "barrel"
    && options["jsExtensions"] === false
    && isTypeScriptSource(filePath)
}

function normaliseGeneratedContent(
  options: BlockOptions,
  filePath: string,
  content: string
): string {
  if (!shouldStripJsExtensions(options, filePath)) {
    return content
  }
  return content.replace(/(["'])(\.{1,2}\/[^"']+)\.js\1/g, "$1$2$1")
}

function indentBlock(content: string, indent: string): string {
  if (indent.length === 0) {
    return content
  }
  return content
    .split("\n")
    .map((line) => line.length === 0 ? line : `${indent}${line}`)
    .join("\n")
}

function renderPreset(options: BlockOptions, meta: { filename: string; existingContent: string }): string {
  const { preset, ...rest } = options
  switch (preset) {
    case "barrel":
      return barrel({ meta, options: rest as Parameters<typeof barrel>[0]["options"] }, undefined)
    case "meta":
      return metaPreset({ meta, options: rest as Parameters<typeof metaPreset>[0]["options"] }, undefined)
    case "model":
      return model({ meta, options: rest as Parameters<typeof model>[0]["options"] }, undefined)
    default:
      throw new Error(`Unknown codegen preset: ${preset}`)
  }
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

        let match: RegExpExecArray | null
        blockRe.lastIndex = 0

        while ((match = blockRe.exec(source)) !== null) {
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
                renderPreset(options, { filename, existingContent })
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
