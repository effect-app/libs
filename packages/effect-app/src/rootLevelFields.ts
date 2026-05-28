import type * as S from "./Schema.js"
import type { RootLevelFieldColumn, RootLevelFieldColumnKind } from "./Store.js"
import * as SchemaAST from "effect/SchemaAST"

const walkTransformation = (ast: SchemaAST.AST): SchemaAST.AST => {
  if (ast._tag === "Declaration" && ast.typeParameters.length > 0) {
    return walkTransformation(ast.typeParameters[0]!)
  }
  return ast
}

const getColumnKind = (ast: SchemaAST.AST): RootLevelFieldColumnKind => {
  const encoded = walkTransformation(SchemaAST.toEncoded(ast))
  switch (encoded._tag) {
    case "String":
      return "string"
    case "Number":
      return "number"
    case "Boolean":
      return "boolean"
    case "Literal":
      switch (typeof encoded.literal) {
        case "string":
          return "string"
        case "number":
          return "number"
        case "boolean":
          return "boolean"
        default:
          return "json"
      }
    case "Union": {
      const scalarKinds = encoded.types.flatMap((type) => {
        const kind = getColumnKind(type)
        return kind === "json" ? [] : [kind]
      })
      const distinctKinds = [...new Set(scalarKinds)]
      return distinctKinds.length === 1 ? distinctKinds[0]! : "json"
    }
    default:
      return "json"
  }
}

const makeColumnName = (key: string) => `__root_${key}`

export const makeRootLevelFieldColumns = (
  schema: S.Schema<unknown>,
  idKey: PropertyKey
): readonly RootLevelFieldColumn[] => {
  const encoded = walkTransformation(SchemaAST.toEncoded(schema.ast))
  if (!SchemaAST.isObjects(encoded)) {
    return []
  }

  return encoded.propertySignatures.flatMap((property) => {
    const key = String(property.name)
    if (key === String(idKey) || key === "id" || key === "_etag") {
      return []
    }
    return [{ key, kind: getColumnKind(property.type), columnName: makeColumnName(key) }]
  })
}
