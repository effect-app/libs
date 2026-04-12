import type { Preset } from "eslint-plugin-codegen"

const filterAdjacent = (input: string[]) => input.filter((i, idx) => input[idx - 1] !== i)

/**
 * Adds file meta
 */
export const meta: Preset<{ sourcePrefix?: string }> = ({ meta, options }) => {
  const sourcePrefix = options.sourcePrefix || "src/"
  const moduleName = filterAdjacent(
    meta
      .filename
      .substring(meta.filename.indexOf(sourcePrefix) + sourcePrefix.length, meta.filename.length - 3)
      .split("/")
  )
    .filter((_) => _ !== "resources")
    .join("/")
  const expectedContent = `export const meta = { moduleName: "${moduleName}" } as const
export const Req = TaggedRequestFor(meta.moduleName)`

  try {
    if (expectedContent === meta.existingContent) {
      return meta.existingContent
    }
  } catch {}

  return expectedContent
}
