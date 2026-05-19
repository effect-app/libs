<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <h1>Nullable nested struct</h1>
      <p>
        <code>override</code> is a nullable struct whose own children are nullable too. It starts as <code>null</code>.
        Fill a single child (e.g. <code>min</code>) and submit: the untouched nullable siblings decode as <code
        >null</code> instead of blocking submission with a spurious "field must not be empty" error.
      </p>
      <form.Input
        label="optionId (NullOr String)"
        name="optionId"
      />
      <form.Input
        label="override.min (NullOr NonNegativeNumber)"
        name="override.min"
        type="number"
      />
      <form.Input
        label="override.max (NullOr NonNegativeNumber)"
        name="override.max"
        type="number"
      />
      <form.Input
        label="override.readOnly (NullOr Boolean)"
        name="override.readOnly"
      />
      <pre>{{ values }}</pre>
      <form.Errors />
      <v-btn type="submit">
        Submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import * as S from "effect-app/Schema"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(
  S.Struct({
    optionId: S.NullOr(S.String),
    example: S.Struct({
      foo: S.NullOr(S.String),
      bar: S.NullOr(S.Number)
    }),
    override: S
      .NullOr(S.Struct({
        min: S.NullOr(S.NonNegativeNumber),
        max: S.NullOr(S.NonNegativeNumber),
        readOnly: S.NullOr(S.Boolean).withConstructorDefault,
        isInteger: S.optional(S.NullOr(S.Boolean))
      }))
      .withConstructorDefault
  }),
  {
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    }
  }
)
</script>

<style scoped>
h1 {
  margin-bottom: 1rem;
}
</style>
