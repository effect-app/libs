<template>
  <OmegaForm
    :schema="schema"
    :on-submit="onSubmit"
  >
    <template #internalForm="{ form }">
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
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaErrors, OmegaForm, OmegaInput } from "../../src/components/OmegaForm"

const schema = S.Struct({
  date: S.NullOr(S.Date)
})

const onSubmit = ({ value }) => {
  console.log(value)
}
</script>
