/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import path from "node:path"
import { fileURLToPath } from "node:url"

import codegen from "eslint-plugin-codegen"
import _import from "eslint-plugin-import"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"
import unusedImports from "eslint-plugin-unused-imports"
import tsParser from "@typescript-eslint/parser"
import effectAppPlugin from "./plugin-effect-app.mjs"


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

/**
 * Minimal ESLint config. Most type-aware TS rules are handled by
 * `oxlint --type-aware` (powered by tsgolint). ESLint here runs the JS-based
 * plugins (codegen, import, unused-imports, sort-destructure-keys) plus the
 * local `@effect-app/no-await-effect` type-aware rule (no tsgolint equivalent),
 * which activates when ESLINT_TS=1 (or `forceTS`).
 *
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @param {unknown} [_project] kept for backward compat; ignored
 * @param {boolean} [_enableOxlint=false] kept for backward compat; ignored
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function baseConfig(dirName, forceTS = false, _project = undefined, _enableOxlint = false) {
  // eslint-disable-next-line no-undef
  const enableTS = !!dirName && (forceTS || process.env["ESLINT_TS"])
  return [
    {
      ignores: [
        "**/*.js",
        "**/*.jsx",
        "**/*.d.ts",
        "**/node_modules/**",
        "vitest.config.ts",
        "vitest.config.test.ts",
        "vite.config.ts",
        "eslint.*.mjs"
      ]
    },
    js.configs.recommended,
    {
      name: "base",
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts", "**/*.vue"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          extraFileExtensions: [".vue"],
          tsconfigRootDir: dirName,
          ...(enableTS && {
            projectService: true
          })
        }
      },
      linterOptions: {
        reportUnusedDisableDirectives: "off"
      },
      plugins: {
        import: _import,
        "sort-destructure-keys": sortDestructureKeys,
        "unused-imports": unusedImports,
        codegen,
        "@effect-app": effectAppPlugin
      },
      rules: {
        "no-unexpected-multiline": "off",
        "no-unused-vars": "off",
        "unused-imports/no-unused-imports": "error",
        "unused-imports/no-unused-vars": [
          "warn",
          {
            "vars": "all",
            "varsIgnorePattern": "^_",
            "args": "after-used",
            "argsIgnorePattern": "^_",
            "ignoreRestSiblings": true
          }
        ],
        "sort-destructure-keys/sort-destructure-keys": "error",
        "require-yield": "off",
        "sort-imports": "off",
        "import/first": "error",
        "import/newline-after-import": "error",
        "import/no-duplicates": ["error", { "prefer-inline": true }],
        "import/no-unresolved": "off",
        "import/order": "off",
        "object-shorthand": "error",
        ...(enableTS && {
          "@effect-app/no-await-effect": "error"
        })
      }
    }
  ]
}

/**
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @param {unknown} [project]
 * @param {boolean} [enableOxlint=false]
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function augmentedConfig(dirName, forceTS = false, project = undefined, enableOxlint = false) {
  return [
    ...baseConfig(dirName, forceTS, project, enableOxlint),
    {
      name: "augmented",
      rules: {
        "codegen/codegen": [
          "error",
          {
            presets: "@effect-app/eslint-codegen-model/dist/presets/index.js"
          }
        ]
      }
    }
  ]
}
