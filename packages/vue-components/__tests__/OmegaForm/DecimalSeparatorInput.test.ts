import { describe, expect, it } from "vitest"
import { handleDecimalSeparatorBeforeinput } from "../../src/components/OmegaForm/decimalSeparatorInput"

// Simulates typing into a VNumberInput: the handler is attached in capture
// phase on the component root, the native input is the event target.
const setup = (
  value: string,
  separator: string,
  cursor?: { start: number; end: number }
) => {
  const root = document.createElement("div")
  const input = document.createElement("input")
  root.appendChild(input)
  document.body.appendChild(root)
  input.value = value
  const start = cursor?.start ?? value.length
  const end = cursor?.end ?? value.length
  input.setSelectionRange(start, end)

  let vuetifySawBeforeinput = false
  let inputEventFired = false
  input.addEventListener("beforeinput", () => {
    vuetifySawBeforeinput = true
  })
  input.addEventListener("input", () => {
    inputEventFired = true
  })
  root.addEventListener(
    "beforeinput",
    (e) => handleDecimalSeparatorBeforeinput(e, separator),
    { capture: true }
  )

  const type = (data: string) => {
    const e = new InputEvent("beforeinput", {
      data,
      inputType: "insertText",
      bubbles: true,
      cancelable: true
    })
    input.dispatchEvent(e)
    return e
  }

  return {
    input,
    type,
    sawVuetifyHandler: () => vuetifySawBeforeinput,
    sawInputEvent: () => inputEventFired
  }
}

describe("handleDecimalSeparatorBeforeinput", () => {
  it("translates '.' into ',' when the active separator is ','", () => {
    const t = setup("1", ",")
    const e = t.type(".")
    expect(e.defaultPrevented).toBe(true)
    expect(t.sawVuetifyHandler()).toBe(false)
    expect(t.input.value).toBe("1,")
    expect(t.sawInputEvent()).toBe(true)
  })

  it("translates ',' into '.' when the active separator is '.'", () => {
    const t = setup("1", ".")
    t.type(",")
    expect(t.input.value).toBe("1.")
  })

  it("translates both '.' and ',' when the active separator is a custom one", () => {
    const dot = setup("1", "٫")
    dot.type(".")
    expect(dot.input.value).toBe("1٫")

    const comma = setup("2", "٫")
    comma.type(",")
    expect(comma.input.value).toBe("2٫")
  })

  it("leaves the event alone when the typed char is the active separator", () => {
    const t = setup("1", ",")
    const e = t.type(",")
    expect(e.defaultPrevented).toBe(false)
    expect(t.sawVuetifyHandler()).toBe(true)
    expect(t.input.value).toBe("1")
  })

  it("leaves plain digits alone", () => {
    const t = setup("1", ",")
    const e = t.type("5")
    expect(e.defaultPrevented).toBe(false)
    expect(t.sawVuetifyHandler()).toBe(true)
  })

  it("swallows the wrong separator when the value already has one", () => {
    const t = setup("1,5", ",")
    const e = t.type(".")
    expect(e.defaultPrevented).toBe(true)
    expect(t.input.value).toBe("1,5")
    expect(t.sawInputEvent()).toBe(false)
  })

  it("inserts at the cursor position and replaces the selection", () => {
    const t = setup("15", ",", { start: 1, end: 1 })
    t.type(".")
    expect(t.input.value).toBe("1,5")
    expect(t.input.selectionStart).toBe(2)
    expect(t.input.selectionEnd).toBe(2)
  })

  it("normalizes the wrong separator inside pasted data", () => {
    const t = setup("", ",")
    t.type("1.5")
    expect(t.input.value).toBe("1,5")
  })
})
