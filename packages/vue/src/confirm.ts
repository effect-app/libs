import { Context, Effect, Layer } from "effect-app"
import { I18n } from "./intl.js"

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class Confirm extends Context.Service<Confirm>()("Confirm", {
  make: Effect.gen(function*() {
    const { intl } = yield* I18n

    const getDefaultMessage = () => intl.formatMessage({ id: "confirm.default", defaultMessage: "Sind sie Sicher?" })

    const confirm = (message = getDefaultMessage()) => Effect.sync(() => window.confirm(message))

    const confirmOrInterrupt = (message = getDefaultMessage()) =>
      confirm(message).pipe(
        Effect.flatMap((result) => (result ? Effect.void : Effect.interrupt))
      )

    return { confirm, confirmOrInterrupt }
  })
}) {
  static readonly DefaultWithoutDependencies = Layer.effect(this, this.make)
  static readonly Default = this.DefaultWithoutDependencies

  static readonly confirm = Effect.fnUntraced(function*(message?: string) {
    const c = yield* Confirm
    return yield* c.confirm(message)
  })
  static readonly confirmOrInterrupt = Effect.fnUntraced(function*(message?: string) {
    const c = yield* Confirm
    return yield* c.confirmOrInterrupt(message)
  })
}
