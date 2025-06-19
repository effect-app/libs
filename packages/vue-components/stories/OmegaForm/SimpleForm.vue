<template>
  <OmegaForm :schema="schema" :on-submit="onSubmit" :subscribe="['values']">
    <template #internalForm="{ form, subscribedValues: { values } }">
      <div>values: {{ values }}</div>
      <OmegaInput label="asder1" name="asder1" :form="form">
        <template #default="inputProps">
          <label :for="inputProps.name">{{ inputProps.label }}</label>
          <input
            :id="inputProps.name"
            v-model="inputProps.field.state.value"
            :name="inputProps.name"
            style="border: 1px solid red"
            type="number"
            @change="(e: any) => inputProps.field.handleChange(e.target.value)"
          />
        </template>
      </OmegaInput>
      <OmegaInput label="asder2" name="asder2" :form="form" />
      <OmegaInput label="asder3" name="asder3" :form="form" />
      <button>submit</button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput } from "../../src/components/OmegaForm"

const schema = S.Struct({
  asder2: S.Number,
  asder1: S.Number,
  asder3: S.String,
})
const onSubmit = ({ value }) => {
  console.log(value)
}
</script>
