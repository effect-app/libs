import { Context } from "effect-app"
import { accessCn, accessFn } from "effect-app/Context"
import { type MakeIntlReturn } from "./makeIntl.js"

type I18nShape = ReturnType<MakeIntlReturn<string>["useIntl"]>

export class I18n extends Context.Opaque<I18n, I18nShape>()("I18n") {
  static readonly locale = accessCn(this, "locale")
  static readonly trans = accessFn(this, "trans")
  static readonly formatMessage = accessFn(this, "formatMessage")
  static readonly intl = accessCn(this, "intl")
}
