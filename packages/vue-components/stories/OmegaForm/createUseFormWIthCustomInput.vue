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

const schema = S.Struct({ asder2: S.String })
const form = useForm(schema, {
  onSubmit: async ({ value }) => {
    console.log(value)
  }
})
</script>
