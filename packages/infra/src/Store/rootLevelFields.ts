import type * as S from "effect-app/Schema"
import * as SchemaAST from "effect/SchemaAST"

export type RootLevelFieldColumnKind = "string" | "number" | "boolean"

export interface RootLevelFieldColumn {
  readonly key: string
  readonly columnName: string
  readonly kind: RootLevelFieldColumnKind
}

const walkTransformation = (ast: SchemaAST.AST): SchemaAST.AST => {
  if (ast._tag === "Declaration" && ast.typeParameters.length > 0) {
    return walkTransformation(ast.typeParameters[0]!)
  }
  return ast
}

const getScalarKind = (ast: SchemaAST.AST): RootLevelFieldColumnKind | undefined => {
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
          return undefined
      }
    case "Union": {
      const scalarKinds = encoded
        .types
        .flatMap((type) => {
          const kind = getScalarKind(type)
          return kind === undefined ? [] : [kind]
        })
      const distinctKinds = [...new Set(scalarKinds)]
      return distinctKinds.length === 1 ? distinctKinds[0] : undefined
    }
    default:
      return undefined
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
    const kind = getScalarKind(property.type)
    return kind === undefined
      ? []
      : [{ key, kind, columnName: makeColumnName(key) }]
  })
}
