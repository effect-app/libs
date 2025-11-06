<template>
  <form.Form :subscribe="['values', 'isDirty', 'canSubmit']">
    <template #default="{ subscribedValues: { values, isDirty, canSubmit } }">
      <div>values: {{ values }} {{ isDirty }} {{ canSubmit }}</div>
      <form.Input
        label="asder2"
        name="categoryId"
      >
        <template #default="{ field, label, state }">
          <label :for="field.name">{{ label }}</label>
          <input
            :id="field.name"
            v-model="state.value"
            :name="field.name"
            style="border: 1px solid red"
            @change="(e: any) => field.handleChange(e.target.value ?? '')"
          >
        </template>
      </form.Input>
      <form.Errors />
      <v-btn type="submit">
        submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

class schema extends S.ExtendedClass<schema, any>("ListOptionItem")({
  categoryId: S.NullOr(S.String), // TODO
  priceTableId: S.NullOr(S.StringId)
}) {}

// const schema = S.Struct({
//   categoryId: S.NullOr(S.String), // TODO
//   priceTableId: S.NullOr(S.StringId)
// })
const form = useOmegaForm(schema, {
  onSubmit: async ({ value }) => {
    console.log(value)
  },
  defaultValues: {}
})
</script>
