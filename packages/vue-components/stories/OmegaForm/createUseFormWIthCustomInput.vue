<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <div>values: {{ values }}</div>
      <form.Input
        label="asder2"
        name="asder2"
        class="test"
        input-class="testina"
      />
      <form.Input name="customLabel">
        <template #label="{ required }">
          <span style="color: blue; font-weight: bold">
            Custom HTML Label
            <span
              v-if="required"
              style="color: red"
            >*</span>
          </span>
        </template>
      </form.Input>
      <v-btn type="submit">
        submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { createUseFormWithCustomInput } from "../../src/components/OmegaForm"
import CustomInput from "./CustomInput.vue"

const useForm = createUseFormWithCustomInput(CustomInput)

const schema = S.Struct({
  asder2: S.String,
  customLabel: S.String
})
const form = useForm(schema, {
  onSubmit: async ({ value }) => {
    console.log(value)
  }
})
</script>
