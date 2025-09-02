import { type Runtime } from "effect-app"
import { type MakeIntlReturn } from "../makeIntl.js"
import { makeUseCommand } from "./useCommand.js"
import { makeUseConfirm } from "./useConfirm.js"
import { makeUseWithToast, type UseToast } from "./useWithToast.js"

export const makeExperimental = <Locale extends string, R>(
  // NOTE: underscores to not collide with auto exports in nuxt apps
  _useIntl: MakeIntlReturn<Locale>["useIntl"],
  _useToast: UseToast,
  runtime: Runtime.Runtime<R>
) => {
  const _useConfirm = makeUseConfirm(_useIntl)
  const _useWithToast = makeUseWithToast(_useToast)
  const _useCommand = makeUseCommand(
    _useIntl,
    _useConfirm,
    _useWithToast,
    runtime
  )

  return {
    useConfirm: _useConfirm,
    useCommand: _useCommand,
    useWithToast: _useWithToast
  }
}
