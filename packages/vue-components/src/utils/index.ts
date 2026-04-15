import { type makeIntl } from "@effect-app/vue"
import type { S } from "effect-app"
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

/**
 * Walks the encoding chain of the given AST node to its source (encoded)
 * side. Shallow — does not recurse into children, so inner prop-level
 * transformations (e.g. `FiniteFromString`) keep their decoded shape
 * while struct-level `decodeTo` transformations are unwrapped to their
 * input side (e.g. `NonNegativeInt` rather than the decoded `PositiveInt`).
 */
export function getTransformationFrom(ast: S.AST.AST) {
  while (ast.encoding) {
    ast = ast.encoding[0].to
  }
  return ast
}
