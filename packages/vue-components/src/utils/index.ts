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
 * In v4, transformations are stored in the `encoding` property, not as wrapped AST nodes.
 * This function returns the encoded form if an encoding chain exists, otherwise returns the AST itself.
 *
 * @param ast - The AST node to extract the transformation source from
 * @returns The source AST (the decoded/type form, which is the AST itself in v4)
 */
export function getTransformationFrom(ast: S.AST.AST) {
  // In v4, the AST itself is the decoded (type) form
  // The encoding chain points to the encoded (wire) form via ast.encoding
  // For most metadata extraction purposes, we want the decoded form, so just return the ast
  return ast
}
