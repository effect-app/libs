import { Context } from "effect-app"
import { type MakeIntlReturn } from "../makeIntl.js"

export class I18n extends Context.TagId("I18n")<I18n, ReturnType<MakeIntlReturn<string>["useIntl"]>>() {
}
