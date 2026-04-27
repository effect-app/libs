import { config } from "@vue/test-utils"
import { useIntlKey } from "../src/utils"

const mockUseIntl = () =>
  ({
    trans: (k: string) => `${k}_translated`,
    formatMessage: (k: string) => `${k}_formatted`
  }) as any

config.global.provide = {
  ...(config.global.provide ?? {}),
  [useIntlKey]: mockUseIntl
}
