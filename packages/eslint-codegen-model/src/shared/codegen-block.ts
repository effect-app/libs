import yaml from "js-yaml"
import { barrel } from "../presets/barrel.js"
import { meta as metaPreset } from "../presets/meta.js"
import { model } from "../presets/model.js"

export type CodegenMeta = {
  filename: string
  existingContent: string
}

export type BlockOptions = Record<string, unknown> & {
  preset: string
}

export const blockRe = /^([ \t]*)\/\/ codegen:start[ \t]*(\{.*\})[ \t]*$\n?([\s\S]*?)^([ \t]*)\/\/ codegen:end[ \t]*$/gm

const tsSourceRe = /\.[cm]?tsx?$/
const jsExtRe = /(["'])(\.{1,2}\/[^"']+)\.js\1/g

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

export function isBlockOptions(input: unknown): input is BlockOptions {
  return isRecord(input) && typeof input["preset"] === "string"
}

export function parseBlockOptions(input: string): BlockOptions {
  const parsed = yaml.load(input)
  if (!isBlockOptions(parsed)) {
    throw new Error(`Invalid codegen options: ${input}`)
  }
  return parsed
}

export function trimTrailingNewline(input: string): string {
  return input.endsWith("\n") ? input.slice(0, -1) : input
}

export function isTypeScriptSource(filePath: string): boolean {
  return tsSourceRe.test(filePath)
}

export function shouldStripJsExtensions(options: BlockOptions, filePath: string): boolean {
  return options.preset === "barrel"
    && options["jsExtensions"] === false
    && isTypeScriptSource(filePath)
}

export function normaliseGeneratedContent(
  options: BlockOptions,
  filePath: string,
  content: string
): string {
  if (!shouldStripJsExtensions(options, filePath)) {
    return content
  }
  return content.replace(jsExtRe, "$1$2$1")
}

export function indentBlock(content: string, indent: string): string {
  if (indent.length === 0) {
    return content
  }
  return content
    .split("\n")
    .map((line) => line.length === 0 ? line : `${indent}${line}`)
    .join("\n")
}

export function renderPreset(options: BlockOptions, meta: CodegenMeta, fullSource?: string): string {
  const { preset, ...rest } = options
  switch (preset) {
    case "barrel":
      return barrel({ meta, options: rest as Parameters<typeof barrel>[0]["options"] }, undefined)
    case "meta":
      return metaPreset({ meta, options: rest as Parameters<typeof metaPreset>[0]["options"] }, undefined)
    case "model":
      return model({ meta, options: rest as Parameters<typeof model>[0]["options"] }, fullSource)
    default:
      throw new Error(`Unknown codegen preset: ${preset}`)
  }
}
