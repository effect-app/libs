import * as S from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"

const RepositoryDependencyAnnotation = "effect-app/Repository/dependency"

/** Marks an encoded model field as an identity alias for repository invalidation. */
export const repositoryDependency = <Schema extends S.Top>(schema: Schema): Schema["Rebuild"] =>
  S.annotateEncoded({ [RepositoryDependencyAnnotation]: true })(schema)

/** @internal */
export const repositoryDependencyPaths = (schema: S.Schema<unknown>): readonly string[] => {
  const visit = (ast: SchemaAST.AST, path: readonly string[]): readonly string[] => {
    const annotations = ast.checks?.at(-1)?.annotations ?? ast.annotations
    if (annotations?.[RepositoryDependencyAnnotation] === true) return [path.join(".")]
    if (SchemaAST.isDeclaration(ast)) return ast.typeParameters.flatMap((parameter) => visit(parameter, path))
    if (SchemaAST.isUnion(ast)) return ast.types.flatMap((member) => visit(member, path))
    if (SchemaAST.isObjects(ast)) {
      return ast.propertySignatures.flatMap((property) =>
        typeof property.name === "string" ? visit(property.type, [...path, property.name]) : []
      )
    }
    if (SchemaAST.isArrays(ast)) {
      return [
        ...ast.elements.flatMap((element, index) => visit(element, [...path, String(index)])),
        ...ast.rest.flatMap((element) => visit(element, [...path, "-1"]))
      ]
    }
    return []
  }

  return [...new Set(visit(SchemaAST.toEncoded(schema.ast), []))]
}
