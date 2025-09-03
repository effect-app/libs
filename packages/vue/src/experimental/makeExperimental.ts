import { Context, Effect, flow, Layer, Runtime } from "effect-app"
import { type MakeIntlReturn } from "../makeIntl.js"
import { Commander } from "./useCommand.js"
import { makeUseConfirm } from "./useConfirm.js"
import { makeUseWithToast, type UseToast } from "./useWithToast.js"

export class IntlSvc extends Context.Tag("IntlSvc")<IntlSvc, ReturnType<MakeIntlReturn<string>["useIntl"]>>() {}
export class ToastSvc extends Context.Tag("ToastSvc")<ToastSvc, ReturnType<UseToast>>() {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class ConfirmSvc extends Effect.Service<ConfirmSvc>()("ConfirmSvc", {
  effect: Effect.gen(function*() {
    const intl = yield* IntlSvc
    return makeUseConfirm(() => intl)() // todo; convert creator to eff
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class WithToastSvc extends Effect.Service<WithToastSvc>()("WithToastSvc", {
  effect: Effect.gen(function*() {
    const toast = yield* ToastSvc
    return makeUseWithToast(() => toast)() // todo; convert creator to eff
  })
}) {}

export const makeExperimental = <Locale extends string, R>(
  // NOTE: underscores to not collide with auto exports in nuxt apps
  _useIntl: MakeIntlReturn<Locale>["useIntl"],
  _useToast: UseToast,
  runtime: Runtime.Runtime<R>
) => {
  const _useConfirm = makeUseConfirm(_useIntl)
  const _useWithToast = makeUseWithToast(_useToast)

  // todo; instead expect layers to be provided from outside.
  const IntlLayer = Layer.sync(IntlSvc, () => _useIntl() as unknown as ReturnType<MakeIntlReturn<string>["useIntl"]>)
  const ToastLayer = Layer.sync(ToastSvc, () => _useToast())
  const L = Commander.Default.pipe(Layer.provide([IntlLayer, ToastLayer]))

  const runFork = Runtime.runFork(runtime)
  const runSync = Runtime.runSync(runtime)

  const _useCommand = () => {
    const cmndr = runSync(Commander.pipe(Effect.provide(L)))

    return { ...cmndr, alt: flow(cmndr.alt, runFork), fn: flow(cmndr.fn, runFork) }
  }

  return {
    useConfirm: _useConfirm,
    useCommand: _useCommand,
    useWithToast: _useWithToast
  }
}
