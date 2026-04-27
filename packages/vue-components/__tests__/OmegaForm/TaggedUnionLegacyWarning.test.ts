import { S } from "effect-app"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe("legacy _tag deprecation warning (current state: dead code)", () => {
  it("does NOT warn for the legacy S.Struct({_tag: S.Literal(...)}) pattern", () => {
    const schema = S.Union([
      S.Struct({ _tag: S.Literal("Legacy"), x: S.String })
    ])
    generateMetaFromSchema(schema)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("does NOT warn for S.TaggedStruct either", () => {
    const schema = S.Union([
      S.TaggedStruct("Modern", { x: S.String })
    ])
    generateMetaFromSchema(schema)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
