<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <form.Input
        label="aString"
        name="aString"
      />
      <form.Input
        label="bString"
        name="bString"
      />
      <pre>{{ values }}</pre>
      <button>submit</button>

      <form.Errors />
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const schema = S.Struct({
  aString: S.NullOr(S.NonEmptyString255).withDefault,
  bString: S.NullOr(S.NonEmptyString255).withDefault
})
const defaultValues = {
  aString: ""
}
const form = useOmegaForm(schema, {
  onSubmit: async (values) => {
    console.log(values)
  },
  defaultValues
})
</script>
