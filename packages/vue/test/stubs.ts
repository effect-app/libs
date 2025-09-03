/* eslint-disable @typescript-eslint/no-explicit-any */
import { type MessageFormatElement } from "@formatjs/icu-messageformat-parser"
import * as Intl from "@formatjs/intl"
import { Effect, Layer } from "effect-app"
import { ref } from "vue"
import { IntlSvc, makeExperimental, ToastSvc } from "../src/experimental/makeExperimental.js"
import { Commander } from "../src/experimental/useCommand.js"
import { type ToastId } from "../src/experimental/useWithToast.js"
import { type MakeIntlReturn } from "../src/makeIntl.js"

const fakeToastLayer = (toasts: any[] = []) =>
  Layer.sync(ToastSvc, () => {
    const dismiss = (id: ToastId) => {
      const idx = toasts.findIndex((_) => _.id === id)
      if (idx > -1) {
        const toast = toasts[idx]
        clearTimeout(toast.timeoutId)
        toasts.splice(idx, 1)
      }
    }
    const fakeToast = (message: string, options?: { timeout?: number; id?: ToastId }) => {
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
    return {
      error: fakeToast,
      warning: fakeToast,
      success: fakeToast,
      info: fakeToast,
      dismiss
    }
  })

export const fakeIntlLayer = (messages: Record<string, string> | Record<string, MessageFormatElement[]> = {}) =>
  Layer.sync(
    IntlSvc,
    () => {
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
    }
  )

export const useExperimental = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const FakeIntlLayer = fakeIntlLayer(options?.messages)
  const FakeToastLayer = fakeToastLayer(options?.toasts)
  const CommanderLayer = Commander.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))

  return Effect.runSync(makeExperimental().pipe(Effect.provide(CommanderLayer)))
}
