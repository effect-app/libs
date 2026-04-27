import { baseConfig } from "@effect-app/eslint-shared-config/eslint.base.config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...baseConfig(__dirname, false),
  {
    ignores: [
      "**/*.js",
      "**/*.jsx",
      "**/*.d.ts",
      "node_modules/"
    ]
  }
]
