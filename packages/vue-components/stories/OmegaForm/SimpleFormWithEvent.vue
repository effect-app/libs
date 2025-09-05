<template>
  <div>
    <h3>Form with @submit event and custom loading state</h3>
    <p>Loading: {{ isLoading }}</p>
    <OmegaForm
      :schema="schema"
      @submit="onSubmit"
      :isLoading="isLoading"
      :subscribe="['values', 'isFormValidating', 'isFormLoading', 'isSubmitting']"
      :validators="validators"
    >
      <template #internalForm="{ form, subscribedValues: { values, isFormValidating, isFormLoading, isSubmitting } }">
        <div>isSubmitting: {{ isSubmitting }}</div>
        <div>isFormValidating: {{ isFormValidating }}</div>
        <div>isFormLoading: {{ isFormLoading }}</div>
        <OmegaInput label="asder2" name="asder2" :form="form" />
        <br />
        <OmegaErrors />
        <button type="submit">Submit</button>
      </template>
    </OmegaForm>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { S } from "effect-app"
import { OmegaForm, OmegaInput, OmegaErrors } from "../../src/components/OmegaForm"

const validateNumberOnServer = async ({ value }: { value: { asder2: string } }) => {

  await new Promise(resolve => setTimeout(resolve, 1500))
  console.log('validateNumberOnServer', value)

  const num = parseInt(value.asder2, 10)

  if (isNaN(num)) {
    console.log('Invalid input: Please enter a valid number')
    return {
      fields: {
        asder2: {
          message: 'Invalid input: Please enter a valid number'
        }
      }
    }
  }

  if (num % 2 !== 0) {
    console.log('Number is odd')
    return {
      fields: {
        asder2: {
          message: `Number ${num} is odd. Please enter an even number.`
        }
      }
    }
  }

  return null
}

const schema = S.Struct({ asder2: S.String })
const isLoading = ref(false)
const validators = {
  onSubmitAsync: validateNumberOnServer
}

const onSubmit = (data: { asder2: string }) => {
  isLoading.value = true
  setTimeout(() => {
    isLoading.value = false
    console.log('Operation complete')
    console.log('Submitted with @submit event:', data)
  }, 2000)
}
</script>