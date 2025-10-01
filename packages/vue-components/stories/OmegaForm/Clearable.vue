<template>
  <form.Form
    :subscribe="['values']"
    @submit="() => console.log('submitted1')"
  >
    <template #default="{ subscribedValues: { values } }">
      <div>values: {{ values }}</div>
      <form.Input
        name="a"
        label="Nullable value"
        clearable
      />
      <v-btn type="submit">
        submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const form = useOmegaForm(S.Struct({ a: S.NullOr(S.String) }), {})
</script>
