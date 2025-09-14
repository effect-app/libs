import { type makeIntl } from "@effect-app/vue"
import { inject, type InjectionKey, provide } from "vue"

export const useIntlKey = Symbol() as InjectionKey<
  ReturnType<typeof makeIntl>["useIntl"]
>
export const useIntl = () => {
  const useIntl = inject(useIntlKey)
  if (!useIntl) {
    throw new Error("useIntl must be used within a IntlProvider")
  }
  return useIntl()
}
export const provideIntl = (
  intl: ReturnType<typeof makeIntl>["useIntl"]
) => provide(useIntlKey, intl)
