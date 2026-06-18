/**
 * Native (tsgo-backed) implementation of {@link ModelTypeResolver}.
 *
 * Where {@link createModelTypeResolver} drives the classic `typescript` Compiler
 * API in-process, this resolver shells out to a forked `tsgolint` binary
 * (`model-codegen` subcommand) that runs the type query on `typescript-go`. The
 * binary builds the program once per invocation and answers a batch of model
 * names over a one-shot JSON-on-stdio protocol.
 *
 * Selected via the CLI `--native` flag; the classic resolver remains the default.
 *
 * Vertical slice: only the `Encoded` member is ported. For any option that needs
 * `Type`/`Make`/services/facade the resolver returns `null`, so the caller falls
 * back to leaving the block untouched (same contract as "no resolver").
 */
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import * as path from "node:path"
import type { ModelTypeResolver, ResolveOptions } from "./type-resolver.ts"

const require_ = createRequire(import.meta.url)

/**
 * Resolve the forked tsgolint binary (the one that also backs `oxlint
 * --type-aware`). Precedence:
 *   1. `TSGOLINT_CODEGEN_BIN` (explicit override),
 *   2. the `oxlint-tsgolint` package — repo-wide overridden to `repos/tsgolint-fork`
 *      via pnpm, whose shim extracts and returns the platform binary.
 *
 * Using the same package as oxlint guarantees one binary serves both the editor
 * lint path (`headless`) and model codegen (`model-codegen`).
 */
function resolveBinary(): string {
  const fromEnv = process.env["TSGOLINT_CODEGEN_BIN"]
  if (fromEnv) return fromEnv
  try {
    const shimPath = require_.resolve("oxlint-tsgolint/bin/tsgolint.js")
    const { ensureBinary } = require_(shimPath) as { ensureBinary: () => string }
    return ensureBinary()
  } catch (e) {
    throw new Error(
      `native model codegen: could not resolve the tsgolint-fork binary via oxlint-tsgolint (${
        (e as Error).message
      }). Ensure the pnpm override is installed, or set TSGOLINT_CODEGEN_BIN.`
    )
  }
}

interface NativeResponse {
  readonly ok: boolean
  readonly blocks?: Record<string, string>
  readonly error?: string
}

export function createNativeModelTypeResolver(args: {
  readonly tsconfigPath: string
  readonly binary?: string
}): ModelTypeResolver {
  const tsconfig = path.resolve(args.tsconfigPath)

  // Resolve (and, on first use, fetch/extract) the binary lazily — only once a
  // codegen block actually needs the type checker. Creating a resolver for a
  // file that turns out to have no static/facade block costs nothing. Memoized.
  let binary: string | undefined
  const getBinary = () => (binary ??= args.binary ?? resolveBinary())

  return {
    generate(filename, modelNames, options: ResolveOptions): string | null {
      const request = JSON.stringify({
        tsconfig,
        fileName: path.resolve(filename),
        models: modelNames,
        options: {
          type: options.type ?? false,
          make: options.make ?? false,
          facade: options.facade ?? false
        }
      })

      let stdout: string
      try {
        stdout = execFileSync(getBinary(), ["model-codegen"], {
          input: request,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024
        })
      } catch (e) {
        const err = e as { stdout?: string }
        // The binary still emits a JSON error payload on a non-zero exit.
        stdout = err.stdout ?? ""
      }

      let parsed: NativeResponse
      try {
        parsed = JSON.parse(stdout) as NativeResponse
      } catch {
        return null
      }
      if (!parsed.ok || !parsed.blocks) return null

      const blocks: Array<string> = []
      for (const name of modelNames) {
        const block = parsed.blocks[name]
        if (block === undefined) return null
        blocks.push(block)
      }
      return blocks.join("\n")
    }
  }
}
