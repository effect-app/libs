/* eslint-disable @typescript-eslint/no-explicit-any */
import { type MessageFormatElement } from "@formatjs/icu-messageformat-parser"
import * as Intl from "@formatjs/intl"
import { Effect, Layer, ManagedRuntime, Option, S } from "effect-app"
import { ApiClientFactory, makeRpcClient } from "effect-app/client"
import { RpcContextMap } from "effect-app/rpc"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { ref } from "vue"
import { Commander } from "../src/commander.js"
import { I18n } from "../src/intl.js"
import { makeClient } from "../src/makeClient.js"
import { type MakeIntlReturn } from "../src/makeIntl.js"
import { makeUseCommand } from "../src/makeUseCommand.js"
import * as Toast from "../src/toast.js"
import { WithToast } from "../src/withToast.js"

const fakeToastLayer = (toasts: any[] = []) =>
  Layer.effect(
    Toast.Toast,
    Effect.sync(() => {
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
      return Toast.Toast.of(Toast.wrap({
        error: fakeToast,
        warning: fakeToast,
        success: fakeToast,
        info: fakeToast,
        dismiss
      })) as any
    })
  )

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
  Layer.effect(I18n, Effect.sync(() => I18n.of(makeFakeIntl(messages))))

export const useExperimental = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const FakeIntlLayer = fakeIntlLayer(options?.messages)
  const FakeToastLayer = fakeToastLayer(options?.toasts)
  const CommanderLayer = Commander.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))
  const WithToastLayer = WithToast.Default.pipe(Layer.provide(FakeToastLayer))
  const layers = Layer.mergeAll(CommanderLayer, WithToastLayer, FakeToastLayer, FakeIntlLayer)

  return Effect.runSync(makeUseCommand<WithToast | Toast.Toast | I18n>(Layer.empty).pipe(Effect.provide(layers)))
}

export class RequestContextMap extends RpcContextMap.makeMap({}) {}
export const { TaggedRequestFor } = makeRpcClient(RequestContextMap)

export const SomethingReq = TaggedRequestFor("Something")

class SomethingGetSomething2 extends SomethingReq<SomethingGetSomething2>()("GetSomething2", {
  id: S.String
}, { success: S.FiniteFromString }) {}

class SomethingGetSomething2WithDependencies
  extends SomethingReq<SomethingGetSomething2WithDependencies>()("GetSomething2", {
    id: S.String
  }, {
    // this is intentilally fake, to simulate a codec that requires a dependency
    success: S.FiniteFromString as S.Codec<number, string, "dep-a">,
    error: S.String
  })
{}

export const Something = {
  GetSomething2: SomethingGetSomething2,
  GetSomething2WithDependencies: SomethingGetSomething2WithDependencies
}

export const SomethingElseReq = TaggedRequestFor("SomethingElse")

class SomethingElseGetSomething2 extends SomethingElseReq<SomethingElseGetSomething2>()("GetSomething2", {
  id: S.String
}, { success: S.FiniteFromString }) {}

class SomethingElseGetSomething2WithDependencies
  extends SomethingElseReq<SomethingElseGetSomething2WithDependencies>()("GetSomething2", {
    id: S.String
  }, {
    success: S.FiniteFromString as S.Codec<number, string, "dep-a">,
    error: S.String
  })
{}

export const SomethingElse = {
  GetSomething2: SomethingElseGetSomething2,
  GetSomething2WithDependencies: SomethingElseGetSomething2WithDependencies
}

export const useClient = (
  options?: { messages?: Record<string, string> | Record<string, MessageFormatElement[]>; toasts: any[] }
) => {
  const FakeIntlLayer = fakeIntlLayer(options?.messages)
  const FakeToastLayer = fakeToastLayer(options?.toasts)
  const CommanderLayer = Commander.Default.pipe(Layer.provide([FakeIntlLayer, FakeToastLayer]))
  const WithToastLayer = WithToast.Default.pipe(Layer.provide(FakeToastLayer))
  const api = ApiClientFactory.layer({ url: "bogus", headers: Option.none() }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )
  const layers = Layer.mergeAll(CommanderLayer, WithToastLayer, FakeToastLayer, FakeIntlLayer, api)

  const clientFor_ = ApiClientFactory.makeFor(Layer.empty)
  return makeClient(() => ManagedRuntime.make(layers), clientFor_, Layer.empty)
}
