import formatjs from "eslint-plugin-formatjs"
import pluginVue from "eslint-plugin-vue"
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript"
import tseslint from "typescript-eslint"
import { baseConfig } from "./eslint.base.config.mjs"
import dprint from "@ben_12/eslint-plugin-dprint"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_DPRINT_CONFIG = path.join(__dirname, "dprint.json")

/**
 * @param {string} dirName
 * @param {boolean} [forceTS=false]
 * @returns {import("eslint").Linter.FlatConfig[]}
 */
export function vueConfig(dirName, forceTS = false, dprintConfigFile ) {

  if (!dprintConfigFile) dprintConfigFile = DEFAULT_DPRINT_CONFIG
  console.log("Using dprint config file:", dprintConfigFile)

  const enableTS = !!dirName && (forceTS || process.env["ESLINT_TS"])

  return [
    ...baseConfig(dirName, forceTS),

    // ...ts.configs.recommended,
    // this should set the vue parser as the parser plus some recommended rules
    ...pluginVue.configs["flat/recommended"],
    ...defineConfigWithVueTs(vueTsConfigs.base),
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
          tsconfigRootDir: dirName,
          ...(enableTS && {
            projectService: true,
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
            allowModifiers: true,
          },
        ]
      },
      plugins: {
        formatjs, // this is for ICU messages, so I'd say we need it here
      },
    },

    {
      name: "augmented",
      plugins: {
        "@ben_12/dprint": dprint,
      },
      rules: {
        ...dprint.configs["disable-typescript-conflict-rules"].rules,
        "vue/html-indent": "off",
        ...dprint.configs["typescript-recommended"].rules,
        ...dprint.configs["malva-recommended"].rules,
        ...dprint.configs["markup-recommended"].rules,
        "@ben_12/dprint/markup": [
          "error",
          {
            // Use dprint JSON configuration file (default: "dprint.json")
            // It may be created using `dprint init` command
            // See also https://dprint.dev/config/
            configFile: dprintConfigFile,
            config: {
              // The markup_fmt configuration of dprint
              // See also https://dprint.dev/plugins/markup_fmt/config/
              "lineWidth": 120,
            },
          },
        ],
        "@ben_12/dprint/typescript": [
          "error",
            {
              configFile: dprintConfigFile,
              config: {
                indentWidth: 2,
                semiColons: "asi",
                quoteStyle: "alwaysDouble",
                trailingCommas: "never",
                "arrowFunction.useParentheses": "force",
                "memberExpression.linePerExpression": true,
                "binaryExpression.linePerExpression": true,
                "importDeclaration.forceSingleLine": true,
                "exportDeclaration.forceSingleLine": true,
                "lineWidth": 120,
              },
            },
        ],
      },
    },
  ]
}