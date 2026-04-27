const legacyTagWarningEmittedFor = new Set<string>()

type GlobalThisWithOptionalProcess = typeof globalThis & {
  process?: { env?: { NODE_ENV?: string } }
}

const isDevelopmentEnvironment = () => {
  const proc = (globalThis as GlobalThisWithOptionalProcess).process
  return proc?.env?.NODE_ENV !== "production"
}

export const warnLegacyTag = (tagValue: string) => {
  if (!isDevelopmentEnvironment()) return
  if (legacyTagWarningEmittedFor.has(tagValue)) return
  legacyTagWarningEmittedFor.add(tagValue)
  console.warn(
    `[OmegaForm] Union member with _tag "${tagValue}" uses S.Struct({ _tag: S.Literal("${tagValue}"), ... }). `
      + `Please migrate to S.TaggedStruct("${tagValue}", { ... }) for cleaner AST handling.`
  )
}
