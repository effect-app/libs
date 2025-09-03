import { Context } from "effect-app"
import { type MakeIntlReturn } from "../makeIntl.js"

export class IntlSvc extends Context.TagId("IntlSvc")<IntlSvc, ReturnType<MakeIntlReturn<string>["useIntl"]>>() {
}
