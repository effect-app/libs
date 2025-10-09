<template>
  <form.Form>
    <form.Input
      label="date"
      name="date"
    >
      <template #default="{ field, state }">
        <input
          :model-value="state.value"
          type="date"
          @change="(e: any) => {
            field.handleChange('2024-06-01T00:00:00.000Z')
          }"
        >
      </template>
    </form.Input>
    <v-btn type="submit">
      submit
    </v-btn>
    <form.Errors />
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  date: S.NullOr(S.Date)
})

const form = useOmegaForm(schema, {
  onSubmit: async ({ value }) => console.log(value)
})
</script>
