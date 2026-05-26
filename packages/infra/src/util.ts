export function snipValue(value: string | readonly string[] | undefined) {
  if (!value) {
    return value
  }
  return Array.isArray(value)
    ? value.map(snipString)
    : typeof value === "string" && value.length > 50
    ? snipString(value)
    : value
}

export function snipString(value: string) {
  return value.length > 255 ? value.slice(0, 255) + "...snip" : value
}
