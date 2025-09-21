<template>
  <OmegaForm :form="form">
    <OmegaInput
      label="date"
      name="date"
      :form="form"
    >
      <template #default="{ field }">
        <input
          :model-value="field.state.value"
          type="date"
          @change="(e: any) => {
            field.handleChange('2024-06-01T00:00:00.000Z')
          }"
        >
      </template>
    </OmegaInput>
    <button>submit</button>
    <OmegaErrors />
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaErrors, OmegaForm, OmegaInput, useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  date: S.NullOr(S.Date)
})

const form = useOmegaForm(schema, {
  onSubmit: async ({ value }) => console.log(value)
})
</script>
