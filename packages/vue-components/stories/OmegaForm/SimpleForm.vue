<template>
  <OmegaForm
    :schema="schema"
    :on-submit="onSubmit"
    :subscribe="['values']"
  >
    <template #internalForm="{ form, subscribedValues: { values } }">
      <OmegaErrors />
      <div>values: {{ values }}</div>
      <OmegaInput
        label="asder2"
        name="asder2"
        :form="form"
      >
        <template #default="inputProps">
          <label :for="inputProps.name">{{ inputProps.label }}</label>
          <input
            :id="inputProps.name"
            v-model="inputProps.field.state.value"
            :name="inputProps.name"
            style="border: 1px solid red"
            @change="(e: any) =>
            inputProps.field.handleChange(e.target.value)"
          >
        </template>
      </OmegaInput>
      <button>submit</button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaErrors, OmegaForm, OmegaInput } from "../../src/components/OmegaForm"

const schema = S.Struct({ asder2: S.String })
const onSubmit = ({ value }) => {
  return new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error("Not implemented")), 2000)
  )
}
</script>
