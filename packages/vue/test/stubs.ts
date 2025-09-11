/* eslint-disable @typescript-eslint/no-explicit-any */
import { type MessageFormatElement } from "@formatjs/icu-messageformat-parser"
import * as Intl from "@formatjs/intl"
import { Effect, Layer } from "effect-app"
import { ref } from "vue"
import { Commander } from "../src/experimental/commander.js"
import { I18n } from "../src/experimental/intl.js"
import { makeUseCommand } from "../src/experimental/makeUseCommand.js"
import * as Toast from "../src/experimental/toast.js"
import { WithToast } from "../src/experimental/withToast.js"
import { type MakeIntlReturn } from "../src/makeIntl.js"

const fakeToastLayer = (toasts: any[] = []) =>
  Toast.Toast.toLayer(Effect.sync(() => {
    const dismiss = (id: Toast.ToastId) => {
      const idx = toasts.findIndex((_) => _.id === id)
      if (idx > -1) {
        const toast = toasts[idx]
        clearTimeout(toast.timeoutId)
        toasts.splice(idx, 1)
      }
    }
    const fakeToast = (message: string, options?: Toast.ToastOpts) => {
      const id = options?.id ?? Math.random().toString(36).substring(2, 15)
      console.log(`Toast [${id}]: ${message}`, options)

      options = { ...options, id }
      const idx = toasts.findIndex((_) => _.id === id)
      if (idx > -1) {
        const toast = toasts[idx]
        clearTimeout(toast.timeoutId)
        Object.assign(toast, { message, options })
        toast.timeoutId = setTimeout(() => {
          toasts.splice(idx, 1)
        }, options?.timeout ?? 3000)
      } else {
        const toast: any = { id, message, options }
        toast.timeoutId = setTimeout(() => {
          toasts.splice(idx, 1)
        }, options?.timeout ?? 3000)
        toasts.push(toast)
      }
      return id
    }
    return Toast.wrap({
      error: fakeToast,
      warning: fakeToast,
      success: fakeToast,
      info: fakeToast,
      dismiss
    })
  }))

export const fakeIntlLayer = (messages: Record<string, string> | Record<string, MessageFormatElement[]> = {}) =>
  I18n.toLayer(
    Effect.sync(() => {
      const locale = ref("en" as const)
      const intlCache = Intl.createIntlCache()
      const intl = Intl.createIntl<typeof locale.value>({
        locale: locale.value,
        messages
      }, intlCache)

      return {
        locale,
        intl,
        trans: (id, values) => intl.formatMessage({ id }, values)
      } as ReturnType<MakeIntlReturn<string>["useIntl"]>
    })
  )

export const useExperimental = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const FakeIntlLayer = fakeIntlLayer(options?.messages)
  const FakeToastLayer = fakeToastLayer(options?.toasts)
  const CommanderLayer = Commander.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))
  const WithToastLayer = WithToast.Default.pipe(Layer.provide(FakeToastLayer))
  const layers = Layer.mergeAll(CommanderLayer, WithToastLayer, FakeToastLayer)

  return Effect.runSync(makeUseCommand<WithToast | Toast.Toast>().pipe(Effect.provide(layers)))
}
