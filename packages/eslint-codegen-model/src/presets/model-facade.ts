export type ModelFacadeOptions = {
  readonly className?: string
  readonly name?: string
  readonly schema?: string
  /**
   * Base mode: emit a non-exported base `class __X extends OpaqueFacade<...>()(_X) {}`
   * instead of `export class X`. The user owns `export class X extends __X { ...statics... }`,
   * so static/instance members live on the public class while `_X` stays a light schema.
   */
  readonly base?: boolean
}

// Whitespace-insensitive equality: the generated class line is long, so dprint wraps the
// `extends OpaqueFacade<...>` type args across multiple lines. Comparing stripped of
// all whitespace lets a dprint-formatted block match the single-line form, so codegen leaves
// it alone instead of reverting it (which would just re-wrap → codegen/dprint oscillation).
const stripWs = (s: string): string => s.replace(/\s+/g, "")

export function modelFacade(
  { meta, options }: { meta?: { existingContent: string }; options: ModelFacadeOptions }
): string {
  const className = options.className
  if (typeof className !== "string" || className.length === 0) {
    return "/** modelFacade requires `className` */"
  }
  const name = typeof options.name === "string" && options.name.length > 0
    ? options.name
    : className.startsWith("_")
    ? className.slice(1)
    : className
  const schema = typeof options.schema === "string" ? options.schema : "S"
  const prefix = schema.length > 0 ? `${schema}.` : ""
  const lhs = options.base === true ? `class __${name}` : `export class ${name}`
  const decl =
    `${lhs} extends ${prefix}OpaqueFacade<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(${className}) {}`
  // The exported facade `class ${name}` merges with the generated `export interface ${name}`
  // (the top-level instance shape from the `model` facade preset) — that merge is intentional,
  // so suppress no-unsafe-declaration-merging. Base mode emits a private `class __${name}` that
  // doesn't merge (the user's own `export class ${name} extends __${name}` owns the disable).
  const expected = options.base === true
    ? decl
    : `// eslint-disable-next-line typescript/no-unsafe-declaration-merging\n${decl}`
  // Preserve the dprint-formatted block when it's equivalent (see stripWs above).
  if (meta && stripWs(meta.existingContent) === stripWs(expected)) {
    return meta.existingContent
  }
  return expected
}
