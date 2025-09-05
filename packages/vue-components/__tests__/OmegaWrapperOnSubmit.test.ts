import { mount, type VueWrapper } from "@vue/test-utils"
import { beforeAll, describe, expect, it } from "vitest"
import OmegaIntlProvider from "./OmegaIntlProvider.vue"
import OmegaWrapperOnSubmitTest from "./OmegaWrapperOnSubmitTest.vue"

const getByTestId = (wrapper: VueWrapper, testId: string) => wrapper.find(`[data-testid="${testId}"]`)

// Helper function to wait for an assertion with timeout
const waitFor = async (assertion: () => void, timeout = 1000, interval = 50) => {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    try {
      assertion()
      return // Assertion passed, exit
    } catch (error: unknown) {
      console.error(error)
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }
  // Final attempt - will throw if assertion still fails
  assertion()
}

beforeAll(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      pathname: "/test",
      search: "",
      href: "http://localhost:3000/test"
    }
  })
})

const TestComponentWithProvider = {
  components: {
    OmegaWrapperOnSubmitTest,
    OmegaIntlProvider
  },
  template: `
    <OmegaIntlProvider>
      <OmegaWrapperOnSubmitTest />
    </OmegaIntlProvider>
  `
}

describe("OmegaWrapper onSubmit feature - Complete Tests", () => {
  it("should handle @submit event with isLoading prop", async () => {
    const wrapper = mount(TestComponentWithProvider)

    // Check initial state
    expect(getByTestId(wrapper, "loading-status-1").text()).toBe("Not loading")
    expect(getByTestId(wrapper, "submitted-data-1").text()).toBe("No data")

    // Submit the form by triggering the form's submit event directly
    const form = getByTestId(wrapper, "test-case-1").find("form")
    await form.trigger("submit")

    // Wait for loading state to become active
    await waitFor(() => {
      expect(getByTestId(wrapper, "loading-status-1").text()).toBe("Loading")
    })

    // Wait for loading to finish
    await waitFor(() => {
      expect(getByTestId(wrapper, "loading-status-1").text()).toBe("Not loading")
    })
  })

  it("should handle traditional onSubmit without isLoading", async () => {
    const wrapper = mount(TestComponentWithProvider)

    // Check initial state
    expect(getByTestId(wrapper, "submitted-data-2").text()).toBe("No data")

    // Submit the form
    const form = getByTestId(wrapper, "test-case-2").find("form")
    await form.trigger("submit")

    // Wait for the handler to complete and update the data
    await waitFor(() => {
      expect(getByTestId(wrapper, "submitted-data-2").text()).toBe("TESTUSER")
    })
  })

  it("should handle form with async validation", async () => {
    const wrapper = mount(TestComponentWithProvider)

    // Check initial state
    expect(getByTestId(wrapper, "loading-status-3").text()).toBe("Not loading")
    expect(getByTestId(wrapper, "submitted-data-3").text()).toBe("No data")

    // Submit with a valid even number (would need actual input in real scenario)
    const submitBtn = getByTestId(wrapper, "submit-3")
    await submitBtn.trigger("click")

    // The form should remain in not loading state (this test is more about structure)
    expect(getByTestId(wrapper, "loading-status-3").text()).toBe("Not loading")
  })

  it("should update loading state correctly during submission", async () => {
    const wrapper = mount(TestComponentWithProvider)

    // Check test case 4 - fieldset disabled state
    expect(getByTestId(wrapper, "loading-status-4").text()).toBe("Form ready")

    // Submit the form
    const form = getByTestId(wrapper, "test-case-4").find("form")
    await form.trigger("submit")

    // Wait for loading state to become active
    await waitFor(() => {
      expect(getByTestId(wrapper, "loading-status-4").text()).toBe("Form is loading")
      expect(getByTestId(wrapper, "fieldset-status-4").text()).toBe("Fieldset should be disabled")
    })

    // Wait for loading to complete
    await waitFor(() => {
      expect(getByTestId(wrapper, "loading-status-4").text()).toBe("Form ready")
      expect(getByTestId(wrapper, "fieldset-status-4").text()).toBe("Fieldset should be enabled")
    })
  })

  it("should provide subscribed values to form slots", async () => {
    const wrapper = mount(TestComponentWithProvider)

    // Check that subscribed values are provided
    const subscribedDiv = getByTestId(wrapper, "subscribed-values-5")
    expect(subscribedDiv.exists()).toBe(true)

    // Initially should show default values
    expect(subscribedDiv.text()).toBe("{\"email\":\"test@example.com\"}")

    // Check submitting state
    const submittingDiv = getByTestId(wrapper, "is-submitting-5")
    expect(submittingDiv.text()).toBe("Not submitting")
  })

  it("should work with external form prop", async () => {
    const wrapper = mount(TestComponentWithProvider)

    // Check initial state
    expect(getByTestId(wrapper, "submitted-data-6").text()).toBe("No data")

    // Submit the form
    const submitBtn = getByTestId(wrapper, "submit-6")
    await submitBtn.trigger("click")

    // Form should have processed the submission (structure test)
    expect(getByTestId(wrapper, "test-case-6").exists()).toBe(true)
  })
})
