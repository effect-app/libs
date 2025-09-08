<template>
  <OmegaForm
    :form="form"
    :subscribe="['values']"
    @submit="() => console.log('submitted1')"
  >
    <template #externalForm="{ subscribedValues: { values } }">
      <div>values: {{ values }}</div>
      <form.Input
        name="a"
        label="Nullable value"
        clearable
      />
      <button type="submit">
        submit
      </button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, useOmegaForm } from "../../src/components/OmegaForm"

const form = useOmegaForm(S.Struct({ a: S.NullOr(S.String) }), {})
</script>
