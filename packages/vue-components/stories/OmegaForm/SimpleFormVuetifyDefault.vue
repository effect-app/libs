<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <form.Input
        label="aString"
        name="aString"
      />
      <pre>{{ values }}</pre>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(S.Struct({ aString: S.UndefinedOr(S.String) }))
</script>
