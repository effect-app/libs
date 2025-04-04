module.exports = {
  singleAttributePerLine: false,
  htmlWhitespaceSensitivity: "ignore",
  vueIndentScriptAndStyle: false,
  printWidth: 120,
  semi: false,
  singleQuote: true,
  trailingComma: "none",
  bracketSameLine: true,
  overrides: [
    {
      files: "*.vue",
      options: {
        parser: "vue",
        singleAttributePerLine: false,
        printWidth: 120
      }
    }
  ]
} 
