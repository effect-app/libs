<template>
  <OmegaForm v-bind="args">
    <template #default="{ form, subscribedValues: { values } }">
      <div>values: {{ values }}</div>
      <OmegaInput label="asder2" name="asder2" :form="form">
        <template #default="inputProps">
          <label :for="inputProps.name">{{ inputProps.label }}</label>
          <input
            :id="inputProps.name"
            v-model="inputProps.field.state.value"
            :name="inputProps.name"
            style="border: 1px solid red"
            @change="e => inputProps.field.handleChange(e.target.value)"
          />
        </template>
      </OmegaInput>
      <button>submit</button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput } from "../../components/OmegaForm"

const args = {
  schema: S.Struct({ asder2: S.String }),
  onSubmit: ({ value }: { value: { asder2: string } }) => {
    console.log(value)
  },
  subscribe: ["values"],
}
</script>
