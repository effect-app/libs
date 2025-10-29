<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <form.Input
        label="aString (uses inputClass)"
        name="aString"
        class="generalClassName"
        input-class="custom-input-class"
      />
      <form.Input
        label="bString (inputClass=null, no class applied)"
        name="bString"
        class="generalClassName"
        :input-class="null"
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

<style scoped>
:deep(.generalClassName) {
  outline: 2px solid red;
  opacity: 0.5;
}

:deep(.custom-input-class) {
  outline: 2px solid blue;
  opacity: 0.8;
}
</style>
