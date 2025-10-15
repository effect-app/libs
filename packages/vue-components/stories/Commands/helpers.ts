import { LegacyMutation, makeClient, makeIntl } from "@effect-app/vue"
import { Commander } from "@effect-app/vue/experimental/commander"
import { Confirm } from "@effect-app/vue/experimental/confirm"
import { I18n } from "@effect-app/vue/experimental/intl"
import * as Toast_ from "@effect-app/vue/experimental/toast"
import { WithToast } from "@effect-app/vue/experimental/withToast"
import { FetchHttpClient } from "@effect/platform"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { ApiClientFactory } from "effect-app/client"
import { ref } from "vue"
import { useToast } from "vue-toastification"
import { Router } from "./useEffectRouter"

const locale = ref("en" as const)
const { useIntl } = makeIntl({
  en: {}
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
export const { Command } = makeClient(() => mrt, clientFor_)
