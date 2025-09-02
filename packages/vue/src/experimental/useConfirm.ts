import { Effect } from "effect-app"
import { type MakeIntlReturn } from "../makeIntl.js"

export const makeUseConfirm = <Locale extends string>(_useIntl: MakeIntlReturn<Locale>["useIntl"]) => () => {
  const { intl } = _useIntl()
  const getDefaultMessage = () =>
    intl.value.formatMessage({ id: "confirm.default", defaultMessage: "Sind sie Sicher?" })

  const confirm = (message = getDefaultMessage()) => Effect.sync(() => window.confirm(message))

  const confirmOrInterrupt = (message = getDefaultMessage()) =>
    confirm(message).pipe(
      Effect.flatMap((result) => (result ? Effect.void : Effect.interrupt))
    )

  return { confirm, confirmOrInterrupt }
}
