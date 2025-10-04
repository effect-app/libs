<template>
  <form.Form :subscribe="['values', 'isDirty']">
    <template #default="{ subscribedValues: { values, isDirty } }">
      <div>values: {{ values }} {{ isDirty }}</div>
      <form.Input
        label="asder2"
        name="asder2"
      />
      <v-btn type="submit">
        submit
      </v-btn>
      <form.Errors />
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({ asder2: S.NonEmptyString })
const form = useOmegaForm(schema, {
  onSubmit: async ({ value }) => {
    console.log(value)
    form.setFieldMeta("asder2", (m) => ({
      ...m,
      errorMap: {
        onSubmit: [
          { path: ["asder2"], message: "Test error, I should reset on any change including empty field (null value)" }
        ]
      }
    }))
  }
})
</script>
