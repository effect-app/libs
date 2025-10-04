<template>
  <form.Form :subscribe="['values', 'isDirty']">
    <template #default="{ subscribedValues: { values, isDirty } }">
      <div>values: {{ values }} {{ isDirty }}</div>
      <form.Input
        label="asder2"
        name="asder2"
      >
        <template #default="{ field, label }">
          <label :for="field.name">{{ label }}</label>
          <input
            :id="field.name"
            v-model="field.state.value"
            :name="field.name"
            style="border: 1px solid red"
            @change="(e: any) => field.handleChange(e.target.value)"
          >
        </template>
      </form.Input>
      <v-btn type="submit">
        submit
      </v-btn>
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
