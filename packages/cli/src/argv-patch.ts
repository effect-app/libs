// Auto-insert "--" for wrap-enabled commands so that args like
// `effect-app-cli index-multi tsc --build` work without quoting.
// The new effect/unstable/cli lexer classifies --flags as LongOption tokens
// and discards unrecognized ones; "--" forces them into trailingOperands.

const wrapCommands = new Set(["index-multi", "packagejson", "packagejson-packages"])

export const patchArgvForWrapCommands = (argv: Array<string>): void => {
  const subIdx = argv.findIndex((a, i) => i >= 2 && wrapCommands.has(a))
  if (subIdx !== -1 && subIdx + 1 < argv.length && !argv.includes("--")) {
    argv.splice(subIdx + 1, 0, "--")
  }
}
