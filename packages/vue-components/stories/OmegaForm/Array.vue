<template>
  <OmegaForm :form="form" :subscribe="['values']">
    <template #externalForm>
      <OmegaArray array :form="form" name="Users">
        <template #default="{ index }">
          <OmegaInput
            :form="form"
            :name="`Users[${index}].name`"
            :label="`name ${index}`"
          />
          <form.Input :name="`Users[${index}].age`" :label="`age ${index}`" />
        </template>
        <template #field="{ field }">
          <v-btn
            type="button"
            variant="tonal"
            @click="field.pushValue({ age: 0 })"
          >
            add
          </v-btn>
        </template>
      </OmegaArray>
      <v-btn type="submit" variant="plain">submit</v-btn>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import {
  OmegaForm,
  useOmegaForm,
  OmegaArray,
  OmegaInput,
} from "../../src/components/OmegaForm"

const schema = S.Struct({
  Users: S.Array(
    S.Struct({ name: S.String, age: S.Number.pipe(S.greaterThan(18)) }),
  ),
})

const form = useOmegaForm(schema, {
  defaultValues: {
    Users: [
      { name: "Mario Mario", age: 33 },
      { name: "Luigi Mario", age: 31 },
    ],
  },
  onSubmit: ({ value }) => {
    console.log(value)
  },
})
</script>
