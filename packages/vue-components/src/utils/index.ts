import { inject, type InjectionKey, provide } from "vue"
import { type makeIntl } from "@effect-app/vue"

const intlKey = Symbol() as InjectionKey<
  ReturnType<ReturnType<typeof makeIntl>["useIntl"]>
>
export const useIntl = () => {
  const intl = inject(intlKey)
  if (!intl) {
    throw new Error("useIntl must be used within a IntlProvider")
  }
  return intl
}
export const provideIntl = (
  intl: ReturnType<ReturnType<typeof makeIntl>["useIntl"]>,
) => provide(intlKey, intl)
