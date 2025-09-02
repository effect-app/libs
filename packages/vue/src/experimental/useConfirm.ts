import { Effect } from "effect-app"
import { type IntlShape } from "../makeIntl.js"

export const makeUseConfirm = (intl: IntlShape) => () => {
  const confirm = (message = "Sind sie Sicher?") => Effect.sync(() => window.confirm(message))

  const confirmOrInterrupt = (
    message = intl.formatMessage({ id: "confirm.default", defaultMessage: "Sind sie Sicher?" })
  ) =>
    confirm(message).pipe(
      Effect.flatMap((result) => (result ? Effect.void : Effect.interrupt))
    )

  return { confirm, confirmOrInterrupt }
}
