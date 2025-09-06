import path from "node:path"
import { fileURLToPath } from "node:url"
import { augmentedConfig } from "./src/eslint.base.config.mjs"

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
