/* eslint-disable @typescript-eslint/no-empty-object-type */
import { createIntl, createIntlCache, type Formatters, type IntlFormatters, type ResolvedIntlConfig } from "@formatjs/intl"
import { typedKeysOf } from "effect-app/utils"
import type { FormatXMLElementFn, PrimitiveType } from "intl-messageformat"
import { computed, type Ref, ref, watch } from "vue"
import { translate } from "./form.js"
import { makeContext } from "./makeContext.js"

export interface MakeIntlReturn<Locale extends string> extends ReturnType<typeof makeIntl<Locale>> {}

// Re-export in the hope to deal with ts issues
export interface IntlShape<T = string> extends ResolvedIntlConfig<T>, IntlFormatters<T> {
  formatters: Formatters
}

export const makeIntl = <Locale extends string>(
  messages: Record<Locale, Record<string, string>>,
  defaultLocale: NoInfer<Locale>
) => {
  const intlCache = createIntlCache()

  const intls = typedKeysOf(messages).reduce(
    (acc, cur) => {
      acc[cur] = createIntl<Locale>(
        {
          defaultLocale,
          locale: cur,
          messages: messages[cur]
        },
        intlCache
      )
      return acc
    },
    {} as Record<Locale, IntlShape<Locale>>
  )

  const LocaleContext = makeContext(ref<Locale>(defaultLocale) as Ref<Locale>)

  const useIntl = () => {
    const locale = LocaleContext.use()

    const trans = (
      id: keyof (typeof messages)[Locale],
      values?: Record<
        string,
        PrimitiveType | FormatXMLElementFn<string, string>
      >
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    ) => intls[locale.value].formatMessage({ id: id as any }, values)

    const intl = computed(() => intls[locale.value])
    watch(
      locale,
      (locale) => {
        const intl = intls[locale]
        translate.value = intl.formatMessage
      },
      { immediate: true }
    )

    return { locale, trans, intl }
  }
  return { useIntl, LocaleContext }
}
