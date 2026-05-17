<template>
  <form.Form :subscribe="['values', 'errors']">
    <template #default="{ subscribedValues: { values, errors } }">
      <p>
        On desktop, both comma and dot work as decimal separators. A decimal value triggers
        <code>validation.integer.expected</code> and an integer is accepted. On iPad,
        <code>type="number"</code> rejects commas silently: <code>target.value</code> becomes
        <code>""</code>, which produces a <code>validation.empty</code> error instead of the
        expected integer error. A dot works correctly on iPad too.
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
  S.Struct({ number: S.Int }),
  {
    onSubmit: async ({ value }) => {
      console.log("submitted:", value)
    }
  }
)
</script>
