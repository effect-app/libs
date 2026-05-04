import { parseSync } from "oxc-parser"

function stripNoise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNoise)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const entries = Object.entries(value).filter(([key]) =>
    key !== "end"
    && key !== "loc"
    && key !== "range"
    && key !== "raw"
    && key !== "start"
  )

  return Object.fromEntries(entries.map(([key, child]) => [key, stripNoise(child)]))
}

export function normaliseModule(code: string, filename: string) {
  return JSON.stringify(
    stripNoise(
      parseSync(filename, code, {
        lang: "ts",
        preserveParens: false,
        sourceType: "module"
      })
        .program
    )
  )
}

export function normaliseModuleForBarrel(code: string, filename: string) {
  return normaliseModule(code.replace(/\/index\b/g, ""), filename)
}
