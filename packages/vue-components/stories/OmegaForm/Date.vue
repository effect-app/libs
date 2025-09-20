<template>
  <OmegaForm
    :schema="schema"
    @submit="onSubmit"
  >
    <template #internalForm="{ form }">
      <form.Input
        label="date"
        name="date"
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
      </form.Input>
      <button>submit</button>
      <form.Errors />
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({
  date: S.NullOr(S.Date)
})

const onSubmit = (value) => {
  console.log(value)
}
</script>
