<template>
  <OmegaForm :form="form" :subscribe="['values']">
    <template #externalForm>
      <OmegaArray array :form="form" name="User">
        <template #default="{ index }">
          <OmegaInput
            :form="form"
            :name="`User[${index}].name`"
            :label="`name ${index}`"
          />
          <form.Input :name="`User[${index}].age`" :label="`age ${index}`" />
        </template>
      </OmegaArray>
      <button>submit</button>
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
  User: S.Array(S.Struct({ name: S.String, age: S.Number })),
})

const form = useOmegaForm(schema, {
  defaultValues: {
    User: [
      { name: "Mario Mario", age: 33 },
      { name: "Luigi Mario", age: 31 },
    ],
  },
  onSubmit: values => {
    console.log(values)
  },
})
</script>
