<template>
  <OmegaForm
    :schema="schema"
    :subscribe="['values']"
    :on-submit="console.log"
  >
    <template #internalForm="{ form, subscribedValues: { values } }">
      <OmegaInput
        label="boolean"
        :form="form"
        name="boolean"
      />
      <OmegaInput
        label="switch"
        :form="form"
        name="switch"
        type="switch"
      />
      <OmegaInput
        label="true"
        :form="form"
        name="true"
        type="boolean"
      />
      <pre>{{ values }}</pre>
      <button>submit</button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput } from "../../src/components/OmegaForm"

const schema = S.Struct({
  boolean: S.Boolean.withDefault,
  switch: S.Boolean,
  true: S.Literal(true)
})
</script>
