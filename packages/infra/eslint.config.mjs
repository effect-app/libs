import { augmentedConfig } from "@effect-app/eslint-shared-config/eslint.base.config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...augmentedConfig(__dirname, false, undefined, true),
  {
    ignores: [
      "**/*.js",
      "**/*.jsx",
      "**/*.d.ts",
      "node_modules/"
    ]
  },
  {
    rules: {
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
]
