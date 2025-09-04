import { Effect } from "effect-app"
import { I18n } from "./intl.js"

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class Confirm extends Effect.Service<Confirm>()("Confirm", {
  effect: Effect.gen(function*() {
    const { intl } = yield* I18n

    const getDefaultMessage = () => intl.formatMessage({ id: "confirm.default", defaultMessage: "Sind sie Sicher?" })

    const confirm = (message = getDefaultMessage()) => Effect.sync(() => window.confirm(message))

    const confirmOrInterrupt = (message = getDefaultMessage()) =>
      confirm(message).pipe(
        Effect.flatMap((result) => (result ? Effect.void : Effect.interrupt))
      )

    return { confirm, confirmOrInterrupt }
  })
}) {}
