import { describe, expect, it } from "vitest"
import { makeNcuUpdateCommand } from "../src/update-packages.js"

describe("makeNcuUpdateCommand", () => {
  it("targets the highest version allowed by the existing semver range", () => {
    expect(makeNcuUpdateCommand("@effect-app/*")).toBe(
      "pnpm exec ncu -u --target semver --filter \"@effect-app/*\""
    )
    expect(makeNcuUpdateCommand("@effect/*", { recursive: true })).toBe(
      "pnpm -r exec ncu -u --target semver --filter \"@effect/*\""
    )
  })
})
