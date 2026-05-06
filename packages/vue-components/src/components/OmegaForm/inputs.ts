const supportedInputs = [
  "button",
  "checkbox",
  "color",
  "date",
  "email",
  "number",
  "password",
  "radio",
  "range",
  "search",
  "submit",
  "tel",
  "text",
  "time",
  "url"
] as const

export type SupportedInputs = typeof supportedInputs[number]

export const getInputType = (input: string): SupportedInputs =>
  (supportedInputs as readonly string[]).includes(input) ? input as SupportedInputs : "text"
