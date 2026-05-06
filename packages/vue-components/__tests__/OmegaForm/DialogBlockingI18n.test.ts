import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { defineComponent, h, ref } from "vue"
import { provideBus, usePreventClose } from "../../src/components/OmegaForm/blockDialog"
import { useIntlKey } from "../../src/utils"

// Regression: when the dialog-closing handler ran with a dirty form, the
// previous fix destructured `formatMessage` from `useIntl()`. The storybook
// mocks shipped a shape without a top-level `formatMessage`, so the
// destructured value was `undefined` and triggered "formatMessage is not a
// function". This test pins the production wiring: as long as `useIntl()`
// exposes `formatMessage` directly (real shape from `@effect-app/vue`),
// the confirm message is the formatted string.
describe("usePreventClose i18n", () => {
  it("calls window.confirm with the formatted message when dirty and dialog is closing", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
    const formatMessage = vi.fn(
      (descriptor: { id: string; defaultMessage?: string }) => `de:${descriptor.id}`
    )

    let bus: ReturnType<typeof provideBus> | undefined
    const Outer = defineComponent({
      setup() {
        bus = provideBus()
        return () => h(Inner)
      }
    })
    const Inner = defineComponent({
      setup() {
        usePreventClose(() => ref(true))
        return () => h("div")
      }
    })

    mount(Outer, {
      global: {
        provide: {
          [useIntlKey as unknown as symbol]: () => ({
            trans: (id: string) => id,
            formatMessage
          })
        }
      }
    })

    bus!.emit("dialog-closing", {})

    expect(formatMessage).toHaveBeenCalledTimes(1)
    expect(formatMessage.mock.calls[0]?.[0]).toMatchObject({ id: "form.unsaved_changes_confirm" })
    expect(confirmSpy).toHaveBeenCalledWith("de:form.unsaved_changes_confirm")

    confirmSpy.mockRestore()
  })

  it("skips the confirm entirely when the form is not dirty", () => {
    const confirmSpy = vi.spyOn(window, "confirm")

    let bus: ReturnType<typeof provideBus> | undefined
    const Outer = defineComponent({
      setup() {
        bus = provideBus()
        return () => h(Inner)
      }
    })
    const Inner = defineComponent({
      setup() {
        usePreventClose(() => ref(false))
        return () => h("div")
      }
    })

    mount(Outer)

    const evt: { prevent?: boolean | Promise<boolean> } = {}
    bus!.emit("dialog-closing", evt)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(evt.prevent).toBeUndefined()

    confirmSpy.mockRestore()
  })
})
