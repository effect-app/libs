export type ModelFacadeOptions = {
  readonly className?: string
  readonly name?: string
  readonly schema?: string
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
  return `export class ${name} extends ${prefix}OpaqueFacadeClass<${name}, ${name}.Encoded, ${name}.Make, ${name}.DecodingServices, ${name}.EncodingServices>()(${className}) {}`
}
