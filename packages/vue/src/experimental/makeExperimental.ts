import { Context, Effect } from "effect-app"
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

export const makeExperimental = Effect.fnUntraced(function*<R = never>() {
  const cmndr = yield* Commander
  const runtime = yield* Effect.runtime<R>()

  return { ...cmndr, alt: cmndr.alt(runtime), fn: cmndr.fn(runtime) }
})
