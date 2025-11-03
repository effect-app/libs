<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
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
  bString: S.PositiveNumber.pipe(S.withDefaultConstructor(() => S.PositiveNumber(2.0)))
  // aString: S.NullOr(S.NonEmptyString).withDefault
})
const defaultValues = {
  bString: -2
}
const form = useOmegaForm(schema, {
  onSubmit: async (values) => {
    console.log(values)
  },
  defaultValues
})
</script>
