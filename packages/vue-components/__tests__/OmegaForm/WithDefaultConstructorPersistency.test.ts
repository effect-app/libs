import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("OmegaForm withDefaultConstructor with persistency", () => {
  beforeEach(() => {
    // Mock window.history.replaceState to avoid DOMException in tests
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {})
  })

  it("should apply withDefaultConstructor defaults and override with query string persistency", async () => {
    const AddSchema = S.Struct({
      first: S.PositiveNumber.pipe(S.withDefaultConstructor(() => S.PositiveNumber(100))),
      second: S.PositiveNumber.pipe(S.withDefaultConstructor(() => S.PositiveNumber(100))),
      third: S.NullOr(S.String).withDefault,
      fourth: S
        .Struct({
          addForm: S.NullOr(S.String),
          b: S.PositiveNumber
        })
        .pipe(S.withDefaultConstructor(() => ({
          addForm: null,
          b: S.PositiveNumber(100)
        }))),
      fifth: S.Email,
      sixth: S.NumberFromString.pipe(S.withDefaultConstructor(() => 1000))
    })

    // Simulate query string parameters
    // The persistency key is based on pathname and schema keys
    // Format: pathname-key1-key2-key3...
    // Keys from meta will be flattened with dot notation for nested fields
    const pathname = "/test"
    const keys = ["first", "second", "third", "fourth.addForm", "fourth.b", "fifth", "sixth"]
    const persistencyKey = `${pathname}-${keys.join("-")}`
    const queryValue = JSON.stringify({ first: 1234 })

    // Mock window.location properties
    Object.defineProperty(window, "location", {
      value: {
        pathname,
        search: `?${persistencyKey}=${encodeURIComponent(queryValue)}`,
        href: `http://localhost${pathname}?${persistencyKey}=${encodeURIComponent(queryValue)}`,
        replace: vi.fn(),
        reload: vi.fn()
      },
      writable: true
    })

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['errors', 'values']" show-errors-on="onChange">
            <template #default="{ subscribedValues: { errors, values } }">
              <div data-testid="errors">Errors: {{ JSON.stringify(errors) }}</div>
              <div data-testid="values">Values: {{ JSON.stringify(values) }}</div>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          AddSchema,
          {},
          {
            persistency: {
              policies: ["querystring"],
              keys: ["first"],
              overrideDefaultValues: true
            }
          }
        )
        return { form }
      }
    })

    await wrapper.vm.$nextTick()

    // Check that errors is an empty array
    const errorsText = wrapper.find("[data-testid=\"errors\"]").text()
    expect(errorsText).toBe("Errors: []")

    // Check that values match the expected output
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText.replace("Values: ", ""))

    expect(values).toEqual({
      first: 1234, // Overridden by query string
      second: 100, // Default from withDefaultConstructor
      third: null, // Default from NullOr withDefault
      fourth: {
        addForm: null,
        b: 100 // Default from withDefaultConstructor
      },
      sixth: "1000"
    })
  })
})
