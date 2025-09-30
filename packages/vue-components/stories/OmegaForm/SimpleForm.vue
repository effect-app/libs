<template>
  <form.Form :subscribe="['values', 'isDirty']">
    <template #default="{ subscribedValues: { values, isDirty } }">
      <div>values: {{ values }} {{ isDirty }}</div>
      <form.Input
        label="asder2"
        name="asder2"
      >
        <template #default="inputProps">
          <label :for="inputProps.name">{{ inputProps.label }}</label>
          <input
            :id="inputProps.name"
            v-model="inputProps.field.state.value"
            :name="inputProps.name"
            style="border: 1px solid red"
            @change="(e: any) => inputProps.field.handleChange(e.target.value)"
          >
        </template>
      </form.Input>
      <button type="submit">
        submit
      </button>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const schema = S.Struct({ asder2: S.String })
const form = useOmegaForm(schema, {
  onSubmit: async ({ value }) => {
    console.log(value)
  }
})
</script>
