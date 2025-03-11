import formatjs from "eslint-plugin-formatjs"
import pluginVue from "eslint-plugin-vue"
import { defineConfigWithVueTs, vueTsConfigs} from '@vue/eslint-config-typescript';
import vuePrettierConfig from "@vue/eslint-config-prettier"

import tseslint from 'typescript-eslint';

import { baseConfig } from "./eslint.base.config.mjs"

/**
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function vueConfig(dirName, forceTS = false) {
  const enableTS = !!dirName && (forceTS || process.env["ESLINT_TS"])

  return [
    ...baseConfig(dirName, forceTS),
    // ...ts.configs.recommended,
    // this should set the vue parser as the parser plus some recommended rules
    ...pluginVue.configs["flat/recommended"],
    ...defineConfigWithVueTs(vueTsConfigs.base),
    vuePrettierConfig,
    {
      name: "vue",
      files: ["*.vue", "**/*.vue"],
      languageOptions: {
        parserOptions: {
          // set a custom parser to parse <script> tags
          parser: {
            "<template>": tseslint.parser,
            "ts": tseslint.parser,
            "js": tseslint.parser,
          },
          ...(enableTS && {
            projectService: true,
            tsconfigRootDir: dirName,
          }),
          extraFileExtensions: [".vue"]
        }
      },
      rules: {
        "no-undef": "off",
        "vue/multi-word-component-names": "warn",
        "vue/no-template-shadow": "warn",
        "vue/valid-v-slot": [
          "error",
          {
            allowModifiers: true
          }
        ]
      },
      plugins: {
        formatjs // this is for ICU messages, so I'd say we need it here
      },
    }
  ]
}