/* eslint-disable @typescript-eslint/no-empty-object-type */
import { createIntl, createIntlCache, type Formatters, type IntlFormatters, type MessageDescriptor, type ResolvedIntlConfig } from "@formatjs/intl"
import { typedKeysOf } from "effect-app/utils"
import { type FormatXMLElementFn, type Options as IntlMessageFormatOptions, type PrimitiveType } from "intl-messageformat"
import { type Ref, watch } from "vue"
import { translate } from "./form.js"
import { makeContext } from "./makeContext.js"

export interface MakeIntlReturn<Locale extends string> extends ReturnType<typeof makeIntl<Locale>> {}

// Re-export in the hope to deal with ts issues
export interface IntlShape<T = string> extends ResolvedIntlConfig<T>, IntlFormatters<T> {
  formatters: Formatters
}

export const makeIntl = <Locale extends string>(
  messages: Record<Locale, Record<string, string>>,
  // TODO: changing locale should really be a page reload, as you don't want to listen to the locale changing at every place
  localeRef: Ref<NoInfer<Locale>>
) => {
  const intlCache = createIntlCache()

  const intls = typedKeysOf(messages).reduce(
    (acc, cur) => {
      acc[cur] = createIntl<Locale>(
        {
          defaultLocale: localeRef.value,
          locale: cur,
          messages: messages[cur]
        },
        intlCache
      )
      return acc
    },
    {} as Record<Locale, IntlShape<Locale>>
  )

  const LocaleContext = makeContext(localeRef)

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

    watch(
      locale,
      (locale) => {
        const intl = intls[locale]
        translate.value = intl.formatMessage
      },
      { immediate: true }
    )

    return {
      locale,
      trans,
      get formatMessage(): (
        descriptor: MessageDescriptor,
        values?: Record<string, PrimitiveType | FormatXMLElementFn<string, string>>,
        opts?: IntlMessageFormatOptions
      ) => string {
        return intls[locale.value].formatMessage
      },
      get intl() {
        return intls[locale.value] as IntlShape<Locale>
      }
    }
  }
  return { useIntl, LocaleContext }
}
