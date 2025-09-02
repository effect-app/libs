import { type MessageFormatElement } from "@formatjs/icu-messageformat-parser"
import * as Intl from "@formatjs/intl"
import { Runtime } from "effect-app"
import { computed, ref } from "vue"
import { makeExperimental } from "../src/experimental/makeExperimental.js"
import { type ToastId } from "../src/experimental/useWithToast.js"

// const mockIntl = {
//   locale: ref("en" as const),
//   trans: (id: string) => id,
//   intl: ref({ formatMessage: (msg: { id: string }) => msg.id })
// } as unknown as ReturnType<ReturnType<typeof makeIntl<string>>["useIntl"]>

const makeUseIntl = (messages: Record<string, string> | Record<string, MessageFormatElement[]>) => () => {
  const locale = ref("en" as const)
  const intlCache = Intl.createIntlCache()
  const intl = Intl.createIntl<typeof locale.value>(
    {
      locale: locale.value,
      messages
    },
    intlCache
  )
  return { locale, intl: computed(() => intl), trans: (id: any, values: any) => intl.formatMessage({ id }, values) }
}

export const useExperimental = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const toasts: any[] = options?.toasts ?? []
  const useIntl = makeUseIntl({ ...options?.messages })

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

  return makeExperimental(
    useIntl,
    () => ({
      error: fakeToast,
      warning: fakeToast,
      success: fakeToast,
      info: fakeToast,
      dismiss
    }),
    Runtime.defaultRuntime
  )
}
