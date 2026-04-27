/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import path from "node:path"
import { fileURLToPath } from "node:url"

import tsParser from "@typescript-eslint/parser"

import codegen from "eslint-plugin-codegen"
import _import from "eslint-plugin-import"
import oxlint from "eslint-plugin-oxlint"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"
import unusedImports from "eslint-plugin-unused-imports"
import tseslint from "typescript-eslint"
import effectAppPlugin from "./plugin-effect-app.mjs"


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

/**
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @param {unknown} [project]
 * @param {boolean} [enableOxlint=false]
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function baseConfig(dirName, forceTS = false, project = undefined, enableOxlint = false) {
  // eslint-disable-next-line no-undef
  const enableTS = !!dirName && (forceTS || process.env["ESLINT_TS"])
  return [
    {
      ignores: [
        "**/*.js",
        // "**/*.mjs",
        // "**/*.cjs",
        "**/*.jsx",
        "**/*.d.ts",
        "**/node_modules/**",
        "vitest.config.ts",
        "vitest.config.test.ts",
        "vite.config.ts",
        "eslint.*.mjs",
      ]
    },
    js.configs.recommended,
    ...tseslint.config(
      js.configs.recommended,
      tseslint.configs.recommended,
    ),
    ...(enableOxlint ? oxlint.configs["flat/recommended"] : []),
    ...(enableTS ? tseslint.configs.recommendedTypeChecked : []),
    {
      // otherwise this config object doesn't apply inside vue files
      // I mean the rules are not applied, the plugins are not loaded
      // files: ["**/*.ts", "**/*.tsx"],
      name: "base",
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          extraFileExtensions: [".vue"], // should be the same as vue config for perfomance reasons (https://typescript-eslint.io/troubleshooting/typed-linting/performance#project-service-issues)
           tsconfigRootDir: dirName,
          ...(enableTS && {
              projectService: true
            })
        }
      },
      settings: {
        "import/parsers": {
          "@typescript-eslint/parser": [".ts", ".tsx"]
        },
        "import/resolver": {
          typescript: {
            alwaysTryTypes: true
          } // this loads <rootdir>/tsconfig.json to eslint
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
        "no-restricted-imports": ["error", {
          "paths": [
            {
              name: ".",
              "message":
                "Please import from the specific file instead. Imports from index in the same directory are almost always wrong (circular)."
            },
            {
              name: "./",
              "message":
                "Please import from the specific file instead. Imports from index in the same directory are almost always wrong (circular)."
            },
            {
              name: "./index",
              "message":
                "Please import from the specific file instead. Imports from index in the same directory are almost always wrong (circular)."
            }
          ]
        }],
        "@typescript-eslint/no-namespace": "off", // We like namespaces, where ES modules cannot compete (augmenting existing types)
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": "off",
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
        "@typescript-eslint/no-use-before-define": ["warn", { functions: false, classes: true, variables: true }], // functions may depend on classes or variables defined later
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/no-empty-object-type": "off",
        "sort-destructure-keys/sort-destructure-keys": "error", // Mainly to sort render props
        "require-yield": "off", // we want to be able to use e.g Effect.gen without having to worry about lint.
        "sort-imports": "off",
        "import/first": "error",
        "import/newline-after-import": "error",
        "import/no-duplicates": ["error", {"prefer-inline": true}],
        "import/no-unresolved": "off", // eslint don't understand some imports very well
        "import/order": "off",
        "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: 'inline-type-imports' }],

        "object-shorthand": "error",
        ...(enableTS
          && {
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
            "@typescript-eslint/no-floating-promises": "error",
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