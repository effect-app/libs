import { S, SchemaAST } from "effect-app"
import type { AST } from "effect-app/Schema"

const get = ["Get", "Index", "List", "All", "Find", "Search"]
const del = ["Delete", "Remove", "Destroy"]
const patch = ["Patch", "Update", "Edit"]

const astAssignableToString = (ast: AST.AST): boolean => {
  // In v4, refined strings (e.g. NonEmptyString) are String nodes with checks — no Refinement wrapper.
  // Transformations are stored as encoding on nodes — no Transformation wrapper.
  // So we check the encoded form to see if the wire format is a string.
  const encoded = SchemaAST.toEncoded(ast)
  if (encoded._tag === "String") return true
  if (encoded._tag === "Union" && encoded.types.every(astAssignableToString)) {
    return true
  }

  return false
}

const onlyStringsAst = (ast: AST.AST): boolean => {
  if (ast._tag === "Union") return ast.types.every(onlyStringsAst)
  // v4: TypeLiteral is now Objects
  if (ast._tag !== "Objects") return false
  return ast.propertySignatures.every((_) => astAssignableToString(_.type))
}

const onlyStrings = (schema: S.Top & { fields?: S.Struct.Fields }): boolean => {
  if ("fields" in schema && schema.fields) return onlyStringsAst(S.Struct(schema.fields).ast) // only one level..
  return onlyStringsAst(schema.ast)
}

export const determineMethod = (fullName: string, schema: S.Top) => {
  const bits = fullName.split(".")
  const actionName = bits[bits.length - 1]!

  if (get.some((_) => actionName.startsWith(_))) {
    return { _tag: "query", method: onlyStrings(schema) ? "GET" as const : "POST" } as const
  }
  if (del.some((_) => actionName.startsWith(_))) {
    return { _tag: "command", method: onlyStrings(schema) ? "DELETE" : "POST" } as const
  }
  if (patch.some((_) => actionName.startsWith(_))) return { _tag: "command", method: "PATCH" } as const
  return { _tag: "command", method: "POST" } as const
}

export const isCommand = (method: ReturnType<typeof determineMethod>) => method._tag === "command"
