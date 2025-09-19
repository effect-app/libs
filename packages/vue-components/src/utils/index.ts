import { type makeIntl } from "@effect-app/vue"
import { type S } from "effect-app"
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
 * Recursively extracts the source AST from a transformation chain.
 * If the provided AST is a transformation, it follows the chain to find the original source AST.
 *
 * @param ast - The AST node to extract the transformation source from
 * @returns The source AST at the end of the transformation chain
 */
export function getTransformationFrom(ast: S.AST.AST) {
  if (ast._tag === "Transformation") {
    return getTransformationFrom(ast.from)
  } else {
    return ast
  }
}
