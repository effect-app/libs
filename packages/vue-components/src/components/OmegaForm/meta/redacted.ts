import * as S from "effect-app/Schema"

/*
 * Checks if an AST node is a S.Redacted Declaration without encoding.
 * These need to be swapped to S.RedactedFromValue for form usage
 * because S.Redacted expects Redacted objects, not plain strings.
 */
const isRedactedWithoutEncoding = (ast: S.AST.AST): boolean =>
  S.AST.isDeclaration(ast)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Effect Schema AST annotations are loosely typed
  && (ast.annotations as any)?.typeConstructor?._tag === "effect/Redacted"
  && !ast.encoding

/*
 * Creates a form-compatible schema by replacing S.Redacted(X) with
 * S.RedactedFromValue(X). S.Redacted is a Declaration that expects
 * Redacted<A> on both encoded and type sides, so form inputs (which
 * produce plain strings) fail validation. S.RedactedFromValue accepts
 * plain values on the encoded side and wraps them in Redacted on decode.
 */
export const toFormSchema = <From, To>(
  schema: S.Codec<To, From>
): S.Codec<To, From> => {
  const ast = schema.ast
  const objAst = S.AST.isObjects(ast)
    ? ast
    : S.AST.isDeclaration(ast)
    ? S.AST.toEncoded(ast)
    : null

  if (!objAst || !("propertySignatures" in objAst)) return schema

  let hasRedacted = false
  const props: Record<string, S.Struct.Fields[string]> = {}

  for (const p of objAst.propertySignatures) {
    if (isRedactedWithoutEncoding(p.type)) {
      hasRedacted = true
      const innerSchema = S.make((p.type as S.AST.Declaration).typeParameters[0])
      props[p.name as string] = S.RedactedFromValue(innerSchema)
    } else if (S.AST.isUnion(p.type)) {
      const types = p.type.types
      const redactedType = types.find(isRedactedWithoutEncoding)
      if (redactedType) {
        hasRedacted = true
        const innerSchema = S.make((redactedType as S.AST.Declaration).typeParameters[0])
        const hasNull = types.some(S.AST.isNull)
        const hasUndefined = types.some(S.AST.isUndefined)
        const base = S.RedactedFromValue(innerSchema)
        props[p.name as string] = hasNull && hasUndefined
          ? S.NullishOr(base)
          : hasNull
          ? S.NullOr(base)
          : hasUndefined
          ? S.UndefinedOr(base)
          : base
      } else {
        props[p.name as string] = S.make(p.type)
      }
    } else {
      props[p.name as string] = S.make(p.type)
    }
  }

  return hasRedacted ? S.Struct(props) as unknown as S.Codec<To, From> : schema
}
