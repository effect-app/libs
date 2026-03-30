import { ServiceMap } from "effect-app"
import { proxify } from "effect-app/ServiceMap"
import { type MakeIntlReturn } from "./makeIntl.js"

export class I18n extends proxify(ServiceMap.Opaque<I18n, ReturnType<MakeIntlReturn<string>["useIntl"]>>()("I18n"))<
  I18n,
  ReturnType<MakeIntlReturn<string>["useIntl"]>
>() {
}
