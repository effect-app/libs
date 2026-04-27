import codegenRule from "./rules/codegen.js"

export default {
  meta: { name: "@effect-app/eslint-codegen-model" },
  rules: {
    codegen: codegenRule
  }
}
