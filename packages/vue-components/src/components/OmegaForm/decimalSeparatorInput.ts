const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * VNumberInput only accepts the active decimal separator and silently drops
 * the other one while typing. Attached in capture phase on the component
 * root, this handler lets users type either "." or ",": the wrong character
 * is translated to the active separator before Vuetify's own beforeinput
 * filter can reject it.
 *
 * No validation beyond Vuetify's own single-separator typing rule: OmegaForm
 * deliberately lets out-of-schema values through so schema errors show,
 * instead of silently blocking input (same reasoning as min/max not being
 * passed as props).
 */
export const handleDecimalSeparatorBeforeinput = (e: InputEvent, separator: string) => {
  if (!e.data) return
  // The active separator may be any single char (locale or explicit prop,
  // e.g. "٫"); everything from [".", ","] that isn't it gets translated.
  const wrongs = [".", ","].filter((c) => c !== separator)
  if (!wrongs.some((c) => e.data!.includes(c))) return

  const input = e.target as HTMLInputElement
  e.preventDefault()
  e.stopPropagation()

  const data = wrongs.reduce((acc, c) => acc.replaceAll(c, separator), e.data)
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  const next = input.value.slice(0, start) + data + input.value.slice(end)
  // Mirrors Vuetify's own typing filter: at most one separator, "-" only at
  // the start. A second separator would only produce an unparseable string.
  if (!new RegExp(`^-?\\d*${escapeForRegex(separator)}?\\d*$`).test(next)) return

  input.value = next
  const cursor = start + data.length
  input.setSelectionRange(cursor, cursor)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
