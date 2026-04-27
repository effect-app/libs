type PresetFn<T = Record<string, unknown>> = (args: {
  meta: { filename: string; existingContent: string }
  options: T
}, context?: unknown) => string

const filterAdjacent = (input: string[]) => input.filter((i, idx) => input[idx - 1] !== i)

/**
 * Adds file meta
 */
export const meta: PresetFn<{ sourcePrefix?: string }> = ({ meta, options }) => {
  const sourcePrefix = options.sourcePrefix || "src/"
  const moduleName = filterAdjacent(
    meta
      .filename
      .substring(meta.filename.indexOf(sourcePrefix) + sourcePrefix.length, meta.filename.length - 3)
      .split("/")
  )
    .filter((_) => _ !== "resources")
    .join("/")
  const expectedContent = `const Req = TaggedRequestFor("${moduleName}")`

  try {
    if (expectedContent === meta.existingContent) {
      return meta.existingContent
    }
  } catch {}

  return expectedContent
}
