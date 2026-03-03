// Join wrap args into a single argv element so that
// `effect-app-cli index-multi tsc --build` works without quoting.
// The new effect/unstable/cli lexer classifies --flags as LongOption tokens
// and discards unrecognized ones at the subcommand level.
// By joining all args after the subcommand into one string, the lexer
// sees a single Value token instead of separate LongOption tokens.

const wrapCommands = new Set(["index-multi", "packagejson", "packagejson-packages"])

export const patchArgvForWrapCommands = (argv: Array<string>): void => {
  const subIdx = argv.findIndex((a, i) => i >= 2 && wrapCommands.has(a))
  if (subIdx === -1 || subIdx + 1 >= argv.length) return

  const wrapArgs = argv.splice(subIdx + 1)
  argv.push(wrapArgs.join(" "))
}
