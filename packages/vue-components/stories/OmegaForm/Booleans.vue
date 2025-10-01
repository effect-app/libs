<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <form.Input
        label="boolean"
        name="boolean"
      />
      <form.Input
        label="switch"
        name="switch"
        type="switch"
      />
      <form.Input
        label="true"
        name="true"
        type="boolean"
      />
      <pre>{{ values }}</pre>
      <v-btn>submit</v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(
  S.Struct({
    boolean: S.Boolean.withDefault,
    switch: S.Boolean,
    true: S.Literal(true)
  }),
  {
    onSubmit: async ({ value }) => {
      console.log(value)
    }
  }
)
</script>
