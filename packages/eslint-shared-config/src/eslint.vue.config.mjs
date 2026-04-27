import formatjs from "eslint-plugin-formatjs"
import pluginVue from "eslint-plugin-vue"
import vueParser from "vue-eslint-parser"
import tsParser from "@typescript-eslint/parser"
import { baseConfig } from "./eslint.base.config.mjs"
import effectAppPlugin from "./plugin-effect-app.mjs"

/**
 * Vue ESLint config. Most type-aware TS rules are handled by `oxlint --type-aware`
 * (powered by tsgolint). ESLint here is retained because oxlint cannot lint
 * `.vue` files; it runs `eslint-plugin-vue` for template/SFC checks, `formatjs`
 * for ICU messages, and the local `@effect-app/no-await-effect` type-aware rule
 * (which has no tsgolint equivalent). `@typescript-eslint/parser` is used as a
 * parser so vue-eslint-parser can read `<script lang="ts">` blocks and so the
 * effect-app plugin can access TypeScript program services.
 *
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function vueConfig(dirName, forceTS = false) {
  // eslint-disable-next-line no-undef
  const enableTS = !!dirName && (forceTS || process.env["ESLINT_TS"])

  return [
    ...baseConfig(dirName, forceTS),

    ...pluginVue.configs["flat/recommended"],
    {
      name: "vue",
      files: ["*.vue", "**/*.vue"],
      languageOptions: {
        parser: vueParser,
        parserOptions: {
          parser: {
            "<template>": tsParser,
            "ts": tsParser,
            "js": tsParser
          },
          tsconfigRootDir: dirName,
          extraFileExtensions: [".vue"],
          ...(enableTS && {
            projectService: true
          })
        }
      },
      rules: {
        "no-undef": "off",
        "vue/html-indent": "off",
        "vue/multi-word-component-names": "warn",
        "vue/no-template-shadow": "warn",
        "vue/valid-v-slot": [
          "error",
          {
            allowModifiers: true
          }
        ],
        ...(enableTS && {
          "@effect-app/no-await-effect": "error"
        })
      },
      plugins: {
        formatjs,
        "@effect-app": effectAppPlugin
      }
    }
  ]
}
