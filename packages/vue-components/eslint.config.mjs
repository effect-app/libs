/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { vueConfig } from "../../eslint.vue.config.mjs"

import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...vueConfig(__dirname, false),
  {
    ignores: [".output/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["./**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    }
  }
]
