import { S } from "effect-app"
import type { AST, Schema } from "effect-app/Schema"

const get = ["Get", "Index", "List", "All", "Find", "Search"]
const del = ["Delete", "Remove", "Destroy"]
const patch = ["Patch", "Update", "Edit"]

const astAssignableToString = (ast: AST.AST): boolean => {
  if (ast._tag === "StringKeyword") return true
  if (ast._tag === "Union" && ast.types.every(astAssignableToString)) {
    return true
  }
  if (ast._tag === "Refinement" || ast._tag === "Transformation") {
    return astAssignableToString(ast.from)
  }

  return false
}

const onlyStringsAst = (ast: AST.AST): boolean => {
  if (ast._tag === "Union") return ast.types.every(onlyStringsAst)
  if (ast._tag !== "TypeLiteral") return false
  return ast.propertySignatures.every((_) => astAssignableToString(_.type))
}

const onlyStrings = (schema: S.Schema<any, any, any> & { fields?: S.Struct.Fields }): boolean => {
  if ("fields" in schema && schema.fields) return onlyStringsAst(S.Struct(schema.fields).ast) // only one level..
  return onlyStringsAst(schema.ast)
}

export const determineMethod = (actionName: string, schema: Schema<any, any, any>) => {
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
