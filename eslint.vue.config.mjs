import formatjs from "eslint-plugin-formatjs"
import pluginVue from "eslint-plugin-vue"
import { defineConfigWithVueTs, vueTsConfigs} from '@vue/eslint-config-typescript';
import vuePrettierConfig from "@vue/eslint-config-prettier"
import dprint from "@ben_12/eslint-plugin-dprint"

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
    {
      ...vuePrettierConfig,
      rules: {
        ...vuePrettierConfig.rules,
        "prettier/prettier": ["error", {
          "singleAttributePerLine": true,
          "htmlWhitespaceSensitivity": "strict",
          "vueIndentScriptAndStyle": true,
          "printWidth": 80,
          "semi": false,
          "singleQuote": true,
          "trailingComma": "none",
          "bracketSameLine": false
        }]
      }
    },
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
        ],
        "vue/html-closing-bracket-newline": ["error", {
          "singleline": "never",
          "multiline": "always"
        }],
        "vue/first-attribute-linebreak": ["error", {
          "singleline": "ignore",
          "multiline": "below"
        }],
        "vue/max-attributes-per-line": ["error", {
          "singleline": {
            "max": 3
          },
          "multiline": {
            "max": 1
          }
        }],
        "vue/multiline-html-element-content-newline": ["error", {
          "allowEmptyLines": false,
          "ignores": ["pre", "textarea"]
        }],
        "vue/html-indent": ["error", 2, {
          "attribute": 1,
          "baseIndent": 1,
          "closeBracket": 0,
          "alignAttributesVertically": true,
          "ignores": []
        }],
        "@ben_12/dprint/typescript": ["error", {
          config: {
            "memberExpression.linePerExpression": false,
            "binaryExpression.linePerExpression": false
          }
        }]
      },
      plugins: {
        formatjs, // this is for ICU messages, so I'd say we need it here
        "@ben_12/dprint": dprint
      }
    }
  ]
}
