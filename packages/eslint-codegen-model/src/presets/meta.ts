type PresetFn<T = Record<string, unknown>> = (args: {
  meta: { filename: string; existingContent: string }
  options: T
}, context?: unknown) => string

type MetaPresetOptions = {
  sourcePrefix?: string
  stripSuffixes?: ReadonlyArray<string>
}

const filterAdjacent = (input: string[]) => input.filter((i, idx) => input[idx - 1] !== i)

const stripConfiguredSuffix = (input: string, suffixes: ReadonlyArray<string>) => {
  const match = suffixes.find((_) => input.endsWith(_))
  return match ? input.slice(0, -match.length) : input
}

const moduleNameFromFilename = (filename: string, sourcePrefix: string, stripSuffixes: ReadonlyArray<string>) => {
  const modulePath = stripConfiguredSuffix(
    filename
      .substring(filename.indexOf(sourcePrefix) + sourcePrefix.length, filename.length - 3)
      .split("/")
      .join("/"),
    stripSuffixes
  )

  return filterAdjacent(modulePath.split("/"))
    .filter((_) => _ !== "resources")
    .join("/")
}

/**
 * Adds file meta
 */
export const meta: PresetFn<MetaPresetOptions> = ({ meta, options }) => {
  const sourcePrefix = options.sourcePrefix || "src/"
  const stripSuffixes = options.stripSuffixes ?? []
  const moduleName = moduleNameFromFilename(meta.filename, sourcePrefix, stripSuffixes)
  const expectedContent = `const Req = TaggedRequestFor("${moduleName}")`

  try {
    if (expectedContent === meta.existingContent) {
      return meta.existingContent
    }
  } catch {}

  return expectedContent
}
