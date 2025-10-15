import { LegacyMutation, makeClient, makeIntl } from "@effect-app/vue"
import { Commander, DefaultIntl } from "@effect-app/vue/experimental/commander"
import { Confirm } from "@effect-app/vue/experimental/confirm"
import { I18n } from "@effect-app/vue/experimental/intl"
import * as Toast_ from "@effect-app/vue/experimental/toast"
import { WithToast } from "@effect-app/vue/experimental/withToast"
import { FetchHttpClient } from "@effect/platform"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { ApiClientFactory } from "effect-app/client"
import { onUnmounted, ref } from "vue"
import { useToast } from "vue-toastification"
import { Router } from "./useEffectRouter"

export const useCommand = (messages: {}) => {
  const locale = ref("en" as const)
  const { useIntl } = makeIntl({
    en: {
      ...DefaultIntl.en,
      ...messages
    }
  }, locale)

  const intlLayer = I18n.toLayer(Effect.sync(useIntl))
  // TODO: use optional CurrentToastId to auto assign toastId when not null?
  const toastLayer = Toast_.Toast.toLayer(
    Effect.sync(() => {
      const t = useToast()
      const toast = {
        error: t.error.bind(t),
        info: t.info.bind(t),
        success: t.success.bind(t),
        warning: t.warning.bind(t),
        dismiss: t.dismiss.bind(t)
      }
      return Toast_.wrap(toast)
    })
  )
  const commanderLayer = Commander.Default.pipe(
    Layer.provide([intlLayer, toastLayer])
  )

  const api = ApiClientFactory.layer({ url: "bogus", headers: Option.none() }).pipe(
    Layer.provide(FetchHttpClient.layer)
  )
  const viewLayers = Layer.mergeAll(Router.Default, intlLayer, toastLayer)
  const provideLayers = Layer
    .mergeAll(
      LegacyMutation.Default.pipe(Layer.provide([toastLayer, intlLayer])),
      commanderLayer,
      viewLayers,
      WithToast.Default.pipe(Layer.provide(toastLayer)),
      Confirm.Default.pipe(Layer.provide(intlLayer))
    )
    .pipe(Layer.provideMerge(api))

  const mrt = ManagedRuntime.make(provideLayers)
  const clientFor_ = ApiClientFactory.makeFor(Layer.empty)
  const { Command } = makeClient(() => mrt, clientFor_)
  return Command
}

/** borrowing the idea from Families in Effect Atom */
export const makeFamily = <Maker extends (input: any) => any>(maker: Maker) => {
  type K = Parameters<Maker>[0]
  const map = new Map<K, ReturnType<typeof maker>>()
  onUnmounted(() => map.clear())
  return (k: K) => {
    if (!map.has(k)) {
      map.set(k, maker(k))
    }
    return map.get(k)!
  }
}
