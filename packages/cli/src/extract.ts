import { type Error as PlatformError, FileSystem, Path } from "@effect/platform"
import { Array as EffectArray, Effect, Order, pipe } from "effect"

/**
 * Generates package.json exports mappings for TypeScript modules
 * This function finds all .ts files in src/ (excluding test files) and generates
 * JSON export entries that map source files to their compiled .js and .d.ts outputs
 *
 * Example output:
 * "./utils/helper": { "types": "./dist/utils/helper.d.ts", "default": "./dist/utils/helper.js" },
 *
 * This allows users to import individual modules instead of the entire package:
 * import { helper } from 'package/utils/helper' instead of 'package'
 */
export const extractExportMappings = Effect.fn("effa-cli.extractExportMappings")(function*(cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const findTsFiles = (dir: string): Effect.Effect<string[], PlatformError.PlatformError, never> =>
    Effect.gen(function*() {
      const entries = yield* fs.readDirectory(dir)

      const results = yield* Effect.all(
        entries.map((entry) =>
          Effect.gen(function*() {
            const fullPath = path.join(dir, entry)
            const stat = yield* fs.stat(fullPath)

            if (stat.type === "Directory") {
              return yield* findTsFiles(fullPath)
            } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
              return [fullPath]
            }
            return []
          })
        )
      )

      return EffectArray.flatten(results)
    })

  const srcDir = path.join(cwd, "src")

  // Check if src directory exists
  const srcExists = yield* fs.exists(srcDir)
  if (!srcExists) {
    return ""
  }

  const tsFiles = yield* findTsFiles(srcDir)

  const exportMappings = tsFiles.map((filePath) => {
    // Get relative path from src directory (like bash script's cut -c 5-)
    const relativePath = path.relative(srcDir, filePath)
    const exportKey = `./${relativePath.replace(/\.ts$/, "")}`
    const distPath = `./dist/${relativePath.replace(/\.ts$/, ".js")}`
    const typesPath = `./dist/${relativePath.replace(/\.ts$/, ".d.ts")}`

    return `"${exportKey}": { "types": "${typesPath}", "default": "${distPath}" }`
  })

  const sortedMappings = pipe(
    exportMappings,
    EffectArray.sort(Order.string),
    EffectArray.join(",\n")
  )

  return sortedMappings
})
