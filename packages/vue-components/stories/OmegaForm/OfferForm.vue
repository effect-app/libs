<template>
  <form.Form :subscribe="['values', 'errors']">
    <template #default="{ subscribedValues: { values, errors } }">
      <p>
        Using NonNegativeNumber schema,
        on Ipad dot works, but comma gives validation.empty error. and value is ""
        on desktop dot works, but comma gives validation.empty error. and value is ""
      </p>
      <form.Input
        label="Nummer"
        name="number"
      />
      <pre>values: {{ values }}</pre>
      <pre>errors: {{ errors }}</pre>
      <v-btn type="submit">
        submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import * as S from "effect-app/Schema"
import { useOmegaForm } from "../../src/components/OmegaForm"

const form = useOmegaForm(
  S.Struct({ number: S.NonNegativeNumber }),
  {
    onSubmit: async ({ value }) => {
      console.log("submitted:", value)
    }
  }
)
</script>
