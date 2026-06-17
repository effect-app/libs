export type ModelFacadeOptions = {
  readonly className?: string
  readonly name?: string
  readonly schema?: string
  /**
   * Base mode: emit a non-exported base `class __X extends OpaqueFacadeClass<...>()(_X) {}`
   * instead of `export class X`. The user owns `export class X extends __X { ...statics... }`,
   * so static/instance members live on the public class while `_X` stays a light schema.
   */
  readonly base?: boolean
}

export function modelFacade({ options }: { options: ModelFacadeOptions }): string {
  const className = options.className
  if (typeof className !== "string" || className.length === 0) {
    return "/** modelFacade requires `className` */"
  }
  const name =
    typeof options.name === "string" && options.name.length > 0 ? options.name : className.startsWith("_") ? className.slice(1) : className
  const schema = typeof options.schema === "string" ? options.schema : "S"
  const prefix = schema.length > 0 ? `${schema}.` : ""
  const lhs = options.base === true ? `class __${name}` : `export class ${name}`
  return `${lhs} extends ${prefix}OpaqueFacadeClass<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(${className}) {}`
}
