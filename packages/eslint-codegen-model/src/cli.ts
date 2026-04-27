#!/usr/bin/env node
import * as fs from "node:fs"
import * as path from "node:path"

import glob from "glob"
import yaml from "js-yaml"

import { barrel } from "./presets/barrel.js"
import { meta as metaPreset } from "./presets/meta.js"
import { model } from "./presets/model.js"

type CodegenMeta = {
  filename: string
  existingContent: string
}

type BlockOptions = Record<string, unknown> & {
  preset: string
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

function shouldStripJsExtensions(options: BlockOptions, filePath: string): boolean {
  return options.preset === "barrel"
    && options["jsExtensions"] === false
    && isTypeScriptSource(filePath)
}

function isTypeScriptSource(filePath: string): boolean {
  return /\.[cm]?tsx?$/.test(filePath)
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

function renderPreset(options: BlockOptions, meta: CodegenMeta): string {
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

function updateFile(filePath: string): boolean {
  const source = fs.readFileSync(filePath, "utf8")
  let changed = false

  const next = source.replace(
    blockRe,
    (_match, indent: string, rawOptions: string, body: string, endIndent: string) => {
      const options = parseBlockOptions(rawOptions)
      const existingContent = trimTrailingNewline(body)
      const generatedContent = trimTrailingNewline(
        normaliseGeneratedContent(
          options,
          filePath,
          renderPreset(options, {
            filename: filePath,
            existingContent
          })
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

function parseArgs(args: ReadonlyArray<string>): { files: Array<string>; help: boolean } {
  const files: Array<string> = []

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
    throw new Error(`Unknown argument: ${part}`)
  }

  return { files, help: false }
}

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

function run() {
  const { files, help } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log("Usage: effect-app-codegen [--file <path>]...")
    console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.")
    return
  }

  const targetFiles = files.length > 0 ? files : defaultFiles()
  const updated: Array<string> = []
  const untouched: Array<string> = []

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`File not found: ${filePath}`)
    }

    const source = fs.readFileSync(filePath, "utf8")
    if (!source.includes("// codegen:start")) {
      continue
    }

    if (updateFile(filePath)) {
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
