import { Effect, S } from "effect-app"
import { buildFieldInfoFromFieldsRoot, translate } from "../src/form.js"

// test schema with integer field
class TestSchema extends S.Class<TestSchema>("TestSchema")({
  integerField: S.Int,
  numberField: S.Number,
  stringField: S.String
}) {}

// mock translate function to capture translation calls
const translationCalls: Array<{ id: string; defaultMessage: string; params?: any }> = []
const mockTranslate = (msg: { id: string; defaultMessage: string }, params?: any) => {
  translationCalls.push({ id: msg.id, defaultMessage: msg.defaultMessage, params })
  // return a marker to know the translation was called
  return `[TRANSLATED:${msg.id}]`
}

beforeEach(() => {
  translationCalls.length = 0
  translate.value = mockTranslate as any
})

it("validates integer field with decimal value", () =>
  Effect.gen(function*() {
    const fieldInfo = buildFieldInfoFromFieldsRoot(TestSchema)
    const integerFieldInfo = fieldInfo.fields.integerField

    expect(integerFieldInfo._tag).toBe("FieldInfo")
    expect(integerFieldInfo.type).toBe("int")

    // test validation rules with a decimal value
    const result = integerFieldInfo.rules[1]("59.5")

    console.log("Validation result:", result)
    console.log("Translation calls:", translationCalls)

    // the validation should fail
    expect(result).not.toBe(true)
    expect(typeof result).toBe("string")

    // check if the correct translation key was called
    const integerErrorCall = translationCalls.find(call => call.id === "validation.integer.expected")
    expect(integerErrorCall).toBeDefined()
    expect(integerErrorCall?.params).toHaveProperty("actualValue")
    expect(integerErrorCall?.params.actualValue).toBe("59.5")
  }).pipe(Effect.runPromise))

it("validates string field parsed as number", () =>
  Effect.gen(function*() {
    const fieldInfo = buildFieldInfoFromFieldsRoot(TestSchema)
    const stringFieldInfo = fieldInfo.fields.stringField

    expect(stringFieldInfo._tag).toBe("FieldInfo")
    expect(stringFieldInfo.type).toBe("text")

    // test validation rules with a number that should fail string validation
    const result = stringFieldInfo.rules[1]("123")

    console.log("Validation result for string field:", result)

    // string field should accept "123" as a valid string
    expect(result).toBe(true)
  }).pipe(Effect.runPromise))

it("validates integer field with valid integer", () =>
  Effect.gen(function*() {
    const fieldInfo = buildFieldInfoFromFieldsRoot(TestSchema)
    const integerFieldInfo = fieldInfo.fields.integerField

    // test validation rules with a valid integer
    const result = integerFieldInfo.rules[1]("59")

    console.log("Validation result for valid integer:", result)

    // the validation should pass
    expect(result).toBe(true)
  }).pipe(Effect.runPromise))

it("error message format matches regex pattern", () => {
  // test the actual error message format from Effect Schema
  const errorMessage = `Int
└─ From side refinement failure
   └─ Int
      └─ Predicate refinement failure
         └─ Expected an integer, actual 59.5`

  const integerMatch = errorMessage.match(/Expected.*integer.*actual\s+(.+)/i)
  expect(integerMatch).toBeTruthy()
  expect(integerMatch![1]).toBe("59.5")

  const numberErrorMessage = `Number
└─ Type side transformation failure
   └─ Expected a number, actual "not-a-number"`

  const numberMatch = numberErrorMessage.match(/Expected.*number.*actual\s+(.+)/i)
  expect(numberMatch).toBeTruthy()
  expect(numberMatch![1]).toBe('"not-a-number"')
})
