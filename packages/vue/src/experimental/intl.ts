import { Context } from "effect-app"
import { proxify } from "effect-app/Context"
import { type MakeIntlReturn } from "../makeIntl.js"

export class I18n extends proxify(Context.TagId("I18n")<I18n, ReturnType<MakeIntlReturn<string>["useIntl"]>>())<
  I18n,
  ReturnType<MakeIntlReturn<string>["useIntl"]>
>() {
}
