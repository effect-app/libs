<template>
  <div>
    <!-- Test Case 1: Basic form with isLoading and @submit event -->
    <div data-testid="test-case-1">
      <h3>Form with isLoading and @submit</h3>
      <p data-testid="loading-status-1">
        {{ isLoading1 ? "Loading" : "Not loading" }}
      </p>
      <p data-testid="submitted-data-1">
        {{ submittedData1 || "No data" }}
      </p>
      <OmegaForm
        :schema="schema1"
        :is-loading="isLoading1"
        :default-values="{ name: 'Test Name' }"
        @submit="handleSubmit1"
      >
        <template #internalForm="{ form }">
          <OmegaInput
            name="name"
            :form="form"
            label="Name"
          />
          <button
            type="submit"
            data-testid="submit-1"
          >
            Submit
          </button>
        </template>
      </OmegaForm>
    </div>

    <!-- Test Case 2: Traditional onSubmit without isLoading -->
    <div data-testid="test-case-2">
      <h3>Traditional onSubmit</h3>
      <p data-testid="submitted-data-2">
        {{ submittedData2 || "No data" }}
      </p>
      <OmegaForm
        :schema="schema2"
        :default-values="{ username: 'testuser' }"
        :on-submit="handleSubmit2"
      >
        <template #internalForm="{ form }">
          <OmegaInput
            name="username"
            :form="form"
            label="Username"
          />
          <button
            type="submit"
            data-testid="submit-2"
          >
            Submit
          </button>
        </template>
      </OmegaForm>
    </div>

    <!-- Test Case 3: With async validation -->
    <div data-testid="test-case-3">
      <h3>With async validation</h3>
      <p data-testid="loading-status-3">
        {{ isLoading3 ? "Loading" : "Not loading" }}
      </p>
      <p data-testid="submitted-data-3">
        {{ submittedData3 || "No data" }}
      </p>
      <OmegaForm
        :schema="schema3"
        :is-loading="isLoading3"
        :validators="validators3"
        :default-values="{ number: '4' }"
        @submit="handleSubmit3"
      >
        <template #internalForm="{ form }">
          <OmegaInput
            name="number"
            :form="form"
            label="Number"
          />
          <button
            type="submit"
            data-testid="submit-3"
          >
            Submit
          </button>
        </template>
      </OmegaForm>
    </div>

    <!-- Test Case 4: Fieldset disabled state -->
    <div data-testid="test-case-4">
      <h3>Fieldset disabled state</h3>
      <p data-testid="loading-status-4">
        {{ isLoading4 ? "Form is loading" : "Form ready" }}
      </p>
      <OmegaForm
        :schema="schema4"
        :is-loading="isLoading4"
        :default-values="{ field: 'test' }"
        @submit="handleSubmit4"
      >
        <template #internalForm="{ form }">
          <OmegaInput
            name="field"
            :form="form"
            label="Field"
          />
          <button
            type="submit"
            data-testid="submit-4"
          >
            Submit
          </button>
          <div data-testid="fieldset-status-4">
            {{
              isLoading4
              ? "Fieldset should be disabled"
              : "Fieldset should be enabled"
            }}
          </div>
        </template>
      </OmegaForm>
    </div>

    <!-- Test Case 5: Subscribe to form values -->
    <div data-testid="test-case-5">
      <h3>Subscribe to form values</h3>
      <OmegaForm
        :schema="schema5"
        :is-loading="isLoading5"
        :subscribe="['values', 'isSubmitting']"
        :default-values="{ email: 'test@example.com' }"
        @submit="handleSubmit5"
      >
        <template #internalForm="{ form, subscribedValues }">
          <OmegaInput
            name="email"
            :form="form"
            label="Email"
          />
          <button
            type="submit"
            data-testid="submit-5"
          >
            Submit
          </button>
          <div data-testid="subscribed-values-5">
            {{ JSON.stringify(subscribedValues?.values || {}) }}
          </div>
          <div data-testid="is-submitting-5">
            {{
              subscribedValues?.isSubmitting
              ? "Submitting"
              : "Not submitting"
            }}
          </div>
        </template>
      </OmegaForm>
    </div>

    <!-- Test Case 6: External form -->
    <div data-testid="test-case-6">
      <h3>External form</h3>
      <p data-testid="submitted-data-6">
        {{ submittedData6 || "No data" }}
      </p>
      <OmegaForm
        :form="externalForm"
        :is-loading="isLoading6"
        @submit="handleSubmit6"
      >
        <template #externalForm="{ subscribedValues }">
          <OmegaInput
            name="description"
            :form="externalForm"
            label="Description"
          />
          <button
            type="submit"
            data-testid="submit-6"
          >
            Submit
          </button>
        </template>
      </OmegaForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { ref } from "vue"
import { OmegaForm, OmegaInput, useOmegaForm } from "../src/components/OmegaForm"

// Test Case 1: Basic form with isLoading
const schema1 = S.Struct({ name: S.String })
const isLoading1 = ref(false)
const submittedData1 = ref<string>("")

const handleSubmit1 = (data: { name: string }) => {
  submittedData1.value = data.name || "empty"
  isLoading1.value = true
  setTimeout(() => {
    isLoading1.value = false
  }, 100)
}

// Test Case 2: Traditional onSubmit
const schema2 = S.Struct({ username: S.String })
const submittedData2 = ref<string>("")

const handleSubmit2 = async ({ value }: { value: { username: string } }) => {
  await new Promise((resolve) => setTimeout(resolve, 50))
  const username = value.username || "empty"
  submittedData2.value = username.toUpperCase()
  return { username: username.toUpperCase() }
}

// Test Case 3: With async validation
const schema3 = S.Struct({ number: S.String })
const isLoading3 = ref(false)
const submittedData3 = ref<string>("")

const validators3 = {
  onSubmitAsync: async ({ value }: { value: { number: string } }) => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    const num = parseInt(value.number, 10)
    if (isNaN(num) || num % 2 !== 0) {
      return {
        fields: {
          number: {
            message: "Please enter an even number"
          }
        }
      }
    }
    return null
  }
}

const handleSubmit3 = (data: { number: string }) => {
  isLoading3.value = true
  submittedData3.value = `Submitted: ${data.number}`
  setTimeout(() => {
    isLoading3.value = false
  }, 100)
}

// Test Case 4: Fieldset disabled state
const schema4 = S.Struct({ field: S.String })
const isLoading4 = ref(false)

const handleSubmit4 = () => {
  isLoading4.value = true
  setTimeout(() => {
    isLoading4.value = false
  }, 100)
}

// Test Case 5: Subscribe to form values
const schema5 = S.Struct({ email: S.String })
const isLoading5 = ref(false)

const handleSubmit5 = () => {
  isLoading5.value = true
  setTimeout(() => {
    isLoading5.value = false
  }, 100)
}

// Test Case 6: External form
const schema6 = S.Struct({ description: S.String })
const externalForm = useOmegaForm(schema6, {
  defaultValues: { description: "Test description" }
})
const isLoading6 = ref(false)
const submittedData6 = ref<string>("")

const handleSubmit6 = (data: { description: string }) => {
  submittedData6.value = data.description
  isLoading6.value = true
  setTimeout(() => {
    isLoading6.value = false
  }, 50)
}
</script>
