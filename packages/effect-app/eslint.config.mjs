import path from "node:path"
import { fileURLToPath } from "node:url"
// Use the shared config package instead of a non-existent local file
import { augmentedConfig } from "@effect-app/eslint-shared-config/eslint.base.config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...augmentedConfig(__dirname, false),
  {
    ignores: [
      "**/*.js",
      "**/*.jsx",
      "**/*.d.ts",
      "node_modules/",
      "src/eslint.*.config.mjs"
    ]
  },
  {
    rules: {
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    }
  }
]
