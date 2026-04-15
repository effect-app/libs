<template>
  <form.Form :subscribe="['values', 'errors']">
    <template #default="{ subscribedValues: { values, errors } }">
      <p>
        Outer schema accepts <strong>NonNegativeInt</strong>; inner target is <strong>PositiveInt</strong>. Typing <code
        >0</code> should be allowed and, on submit, the decode fallback should rewrite it to
        <code>666</code>. Any positive value should pass through unchanged.
      </p>
      <form.Input
        label="Amount"
        name="amount"
      />
      <pre>values: {{ values }}</pre>
      <pre>errors: {{ errors }}</pre>
      <pre>submitted: {{ lastSubmitted }}</pre>
      <v-btn type="submit">
        submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S, SchemaGetter } from "effect-app"
import { ref } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const inputSchema = S.Struct({ amount: S.PositiveInt })

const transformedSchema = S.Struct({ amount: S.NonNegativeInt }).pipe(
  S.decodeTo(inputSchema, {
    decode: SchemaGetter.transform((input: { amount: number }) => input.amount === 0 ? { amount: 666 } : input),
    encode: SchemaGetter.passthrough({ strict: false })
  })
)

const lastSubmitted = ref<unknown>(null)

const form = useOmegaForm(transformedSchema, {
  defaultValues: { amount: 1 },
  onSubmit: async ({ value }) => {
    lastSubmitted.value = value
    console.log("submitted:", value)
  }
})
</script>
