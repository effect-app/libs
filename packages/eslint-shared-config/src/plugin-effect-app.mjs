// @ts-nocheck
/**
 * Custom ESLint plugin for effect-app rules (requires type information).
 */

const FORBIDDEN_TYPES = {
  Effect: "Effect",
  Option: "Option",
  Some: "Option",
  None: "Option",
  Result: "Result",
  Ok: "Result",
  Err: "Result",
  Fiber: "Fiber"
}

/** @type {import("eslint").Rule.RuleModule} */
const noAwaitEffect = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow awaiting Effect, Option, Either, or RuntimeFiber values from the effect library"
    },
    messages: {
      noAwait: "Do not `await` an effect `{{typeName}}`. Use Effect.runPromise or the appropriate runner instead."
    },
    schema: []
  },
  create(context) {
    const services = context.sourceCode.parserServices
    if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
      return {}
    }
    const checker = services.program.getTypeChecker()

    return {
      AwaitExpression(node) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(node.argument)
        if (!tsNode) return

        const type = checker.getTypeAtLocation(tsNode)
        const matched = matchesForbiddenType(type, checker)
        if (matched) {
          context.report({
            node,
            messageId: "noAwait",
            data: { typeName: matched }
          })
        }
      }
    }
  }
}

/**
 * Recursively checks if a type (or any part of a union) is one of the forbidden effect types.
 * Returns the matched type name or null.
 */
function matchesForbiddenType(type, checker) {
  if (type.isUnion()) {
    for (const t of type.types) {
      const m = matchesForbiddenType(t, checker)
      if (m) return m
    }
    return null
  }
  const symbol = type.getSymbol() ?? type.aliasSymbol
  if (!symbol) return null

  const name = symbol.getName()
  if (!FORBIDDEN_TYPES[name]) return null

  // Verify it originates from the effect library
  const declarations = symbol.getDeclarations()
  if (!declarations?.length) return null
  for (const decl of declarations) {
    const fileName = decl.getSourceFile().fileName
    if (fileName.includes("effect/")) {
      return FORBIDDEN_TYPES[name]
    }
  }
  return null
}

/** @type {import("eslint").ESLint.Plugin} */
export default {
  meta: { name: "@effect-app/local", version: "0.0.0" },
  rules: {
    "no-await-effect": noAwaitEffect
  }
}
