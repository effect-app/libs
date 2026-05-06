// @ts-nocheck
import js from "@eslint/js"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import _import from "eslint-plugin-import"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"
import unusedImports from "eslint-plugin-unused-imports"
import effectAppPlugin from "./plugin-effect-app.mjs"

/**
 * Minimal ESLint config. Type-aware TS rules and codegen also run via
 * `oxlint --type-aware` (powered by tsgolint + the
 * `@effect-app/eslint-codegen-model/oxlint` JS plugin) for non-vue packages.
 *
 * ESLint here is needed for vue packages (oxlint can't lint `.vue` files) and
 * runs JS-based plugins (import, unused-imports, sort-destructure-keys), the
 * `@typescript-eslint` plugin (so inline `eslint-disable @typescript-eslint/...`
 * directives resolve and a small set of type-aware rules run on `.vue` files),
 * plus the local `@effect-app/no-await-effect` rule (no tsgolint equivalent).
 * Type-aware rules activate when ESLINT_TS=1 (or `forceTS`).
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
        "@typescript-eslint": tsPlugin,
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
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-use-before-define": ["warn", { functions: false, classes: true, variables: true }],
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/no-empty-object-type": "off",
        "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
        ...(enableTS && {
          "@effect-app/no-await-effect": "error",
          "@typescript-eslint/restrict-template-expressions": "warn",
          "@typescript-eslint/restrict-plus-operands": "off",
          "@typescript-eslint/no-unsafe-assignment": "warn",
          "@typescript-eslint/no-unsafe-call": "warn",
          "@typescript-eslint/no-unsafe-return": "warn",
          "@typescript-eslint/no-unsafe-argument": "warn",
          "@typescript-eslint/no-unsafe-member-access": "warn",
          "@typescript-eslint/no-misused-promises": "warn",
          "@typescript-eslint/unbound-method": "error",
          "@typescript-eslint/only-throw-error": "off",
          "@typescript-eslint/no-base-to-string": "warn",
          "@typescript-eslint/no-floating-promises": "error"
        })
      }
    }
  ]
}

