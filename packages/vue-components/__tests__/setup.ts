import { config } from "@vue/test-utils"
import { useIntlKey } from "../src/utils"

const mockUseIntl = () =>
  ({
    trans: (k: string) => `${k}_translated`,
    formatMessage: (
      descriptor: { id?: string; defaultMessage?: string },
      _values?: Record<string, unknown>
    ) => `${descriptor.id ?? descriptor.defaultMessage ?? ""}_formatted`
  }) as any

config.global.provide = {
  ...(config.global.provide ?? {}),
  [useIntlKey]: mockUseIntl
}
