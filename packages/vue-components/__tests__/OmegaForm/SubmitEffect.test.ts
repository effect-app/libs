// __tests__/OmegaForm/SubmitEffect.test.ts
import { mount } from "@vue/test-utils"
import { Cause, Effect, Exit, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { defineComponent } from "vue"
import { FormErrors, useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const mountForm = <T>(setupForm: () => T): T => {
  let captured: T | undefined
  const Inner = defineComponent({
    setup() {
      captured = setupForm()
      return {}
    },
    template: "<div></div>"
  })
  const Wrapper = defineComponent({
    components: { OmegaIntlProvider, Inner },
    template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
  })
  mount(Wrapper)
  if (!captured) throw new Error("setupForm did not return")
  return captured
}

describe("handleSubmitEffect", () => {
  it("succeeds with void on valid input (no checkErrors)", async () => {
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String.pipe(S.check(S.isMinLength(2))) }),
        { defaultValues: { x: "ok" }, onSubmit: async () => undefined }
      )
    )
    const exit = await Effect.runPromise(Effect.exit(form.handleSubmitEffect()))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("succeeds with void even on invalid input without checkErrors", async () => {
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String.pipe(S.check(S.isMinLength(2))) }),
        { defaultValues: { x: "" }, onSubmit: async () => undefined }
      )
    )
    const exit = await Effect.runPromise(Effect.exit(form.handleSubmitEffect()))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("fails with FormErrors when checkErrors and validation fails", async () => {
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String.pipe(S.check(S.isMinLength(2))) }),
        { defaultValues: { x: "" }, onSubmit: async () => undefined }
      )
    )
    const exit = await Effect.runPromise(
      Effect.exit(form.handleSubmitEffect({ checkErrors: true }))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failReason = exit.cause.reasons.find(Cause.isFailReason)
      expect(failReason?.error).toBeInstanceOf(FormErrors)
    }
  })

  it("delivers decoded To to onSubmit (not raw From)", async () => {
    let received: unknown
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ n: S.FiniteFromString }),
        {
          defaultValues: { n: "42" },
          onSubmit: async ({ value }) => {
            received = value
          }
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(received).toEqual({ n: 42 })
  })

  it("awaits Promise-returning onSubmit", async () => {
    let resolved = false
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String }),
        {
          defaultValues: { x: "" },
          onSubmit: async () => {
            await new Promise((r) => setTimeout(r, 5))
            resolved = true
          }
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(resolved).toBe(true)
  })

  it("awaits Effect-returning onSubmit", async () => {
    let resolved = false
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String }),
        {
          defaultValues: { x: "" },
          onSubmit: () =>
            Effect.sync(() => {
              resolved = true
            })
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(resolved).toBe(true)
  })

  it("awaits Fiber-returning onSubmit", async () => {
    let resolved = false
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String }),
        {
          defaultValues: { x: "" },
          onSubmit: () =>
            Effect.runFork(
              Effect.sync(() => {
                resolved = true
              })
            )
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(resolved).toBe(true)
  })
})
