/* eslint-disable @typescript-eslint/no-explicit-any */
import { FetchHttpClient } from "@effect/platform"
import { type MessageFormatElement } from "@formatjs/icu-messageformat-parser"
import * as Intl from "@formatjs/intl"
import { Effect, Layer, ManagedRuntime, Option, S } from "effect-app"
import { ApiClientFactory, makeRpcClient } from "effect-app/client"
import { RpcContextMap } from "effect-app/rpc"
import { ref } from "vue"
import { Commander2 } from "../src/experimental/commander2.js"
import { I18n } from "../src/experimental/intl.js"
import { makeUseCommand } from "../src/experimental/makeUseCommand.js"
import * as Toast from "../src/experimental/toast.js"
import { WithToast } from "../src/experimental/withToast.js"
import { LegacyMutation, makeClient } from "../src/makeClient.js"
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

export const makeFakeIntl = (messages: Record<string, string> | Record<string, MessageFormatElement[]> = {}) => {
  const locale = ref("en" as const)
  const intlCache = Intl.createIntlCache()
  const intl = Intl.createIntl<typeof locale.value>({
    locale: locale.value,
    messages
  }, intlCache)

  return {
    locale,
    intl,
    trans: (id, values) => intl.formatMessage({ id }, values),
    get formatMessage() {
      return intl.formatMessage
    }
  } as ReturnType<MakeIntlReturn<string>["useIntl"]>
}

export const fakeIntlLayer = (messages: Record<string, string> | Record<string, MessageFormatElement[]> = {}) =>
  I18n.toLayer(
    Effect.sync(() => makeFakeIntl(messages))
  )

export const useExperimental = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const FakeIntlLayer = fakeIntlLayer(options?.messages)
  const FakeToastLayer = fakeToastLayer(options?.toasts)
  const CommanderLayer = Commander2.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))
  const WithToastLayer = WithToast.Default.pipe(Layer.provide(FakeToastLayer))
  const layers = Layer.mergeAll(CommanderLayer, WithToastLayer, FakeToastLayer, FakeIntlLayer)

  return Effect.runSync(makeUseCommand<WithToast | Toast.Toast | I18n>().pipe(Effect.provide(layers)))
}

export class RequestContextMap extends RpcContextMap.makeMap({}) {}
export const { TaggedRequest: Req } = makeRpcClient(RequestContextMap)
export class GetSomething2 extends Req<GetSomething2>()("GetSomething2", {
  id: S.String
}, { success: S.NumberFromString }) {}

export class GetSomething2WithDependencies extends Req<GetSomething2WithDependencies>()("GetSomething2", {
  id: S.String
}, {
  success: S.NumberFromString as S.Schema<number, string, "dep-a">,
  failure: S.String as S.Schema<string, string, "dep-b">
}) {}

export const Something = { GetSomething2, GetSomething2WithDependencies, meta: { moduleName: "Something" as const } }

export const useClient = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const FakeIntlLayer = fakeIntlLayer(options?.messages)
  const FakeToastLayer = fakeToastLayer(options?.toasts)
  const CommanderLayer = Commander2.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))
  const WithToastLayer = WithToast.Default.pipe(Layer.provide(FakeToastLayer))
  const api = ApiClientFactory.layer({ url: "bogus", headers: Option.none() }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )
  const lm = LegacyMutation.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))
  const layers = Layer.mergeAll(CommanderLayer, WithToastLayer, FakeToastLayer, FakeIntlLayer, api, lm)

  const clientFor_ = ApiClientFactory.makeFor(Layer.empty)
  return makeClient(() => ManagedRuntime.make(layers), clientFor_)
}
