<template>
  <OmegaForm
    :schema="schema"
    :subscribe="['values']"
  >
    <template #internalForm="{ form, subscribedValues: { values } }">
      <OmegaInput
        label="aString"
        :form="form"
        name="aString"
      />
      <pre>{{ values }}</pre>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput } from "../../src/components/OmegaForm"

const schema = S.Struct({ aString: S.UndefinedOr(S.String) })
</script>
