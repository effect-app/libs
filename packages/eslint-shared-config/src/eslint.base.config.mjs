// @ts-nocheck
import js from "@eslint/js"
import tsParser from "@typescript-eslint/parser"
import _import from "eslint-plugin-import"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"
import unusedImports from "eslint-plugin-unused-imports"
import effectAppPlugin from "./plugin-effect-app.mjs"

/**
 * Minimal ESLint config. Type-aware TS rules and codegen are handled by
 * `oxlint --type-aware` (powered by tsgolint + the `@effect-app/eslint-codegen-model/oxlint`
 * JS plugin). ESLint here runs only what oxlint can't: JS-based plugins
 * (import, unused-imports, sort-destructure-keys) plus the local
 * `@effect-app/no-await-effect` type-aware rule (no tsgolint equivalent),
 * which activates when ESLINT_TS=1 (or `forceTS`).
 *
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function baseConfig(dirName, forceTS = false) {
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
