import path from "node:path"
import { fileURLToPath } from "node:url"
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
      "node_modules/"
    ]
  },
  {
    rules: {
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
    }
  }
]
