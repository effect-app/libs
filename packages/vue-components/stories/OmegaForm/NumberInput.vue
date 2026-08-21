<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <pre>{{ values }}</pre>

      <!-- S.Int with min/max from the schema: precision 0 is automatic (no decimal separator), stepper clamps to 1-20 -->
      <form.Input
        name="quantity"
        label="Quantity (1-20)"
      />

      <!-- S.Number: free decimals (precision null is automatic), clearing sets undefined -->
      <form.Input
        name="price"
        label="Price (optional, decimals)"
      />

      <!-- extra VNumberInput props pass through attrs and win over the schema-driven defaults -->
      <form.Input
        name="steps"
        label="Steps of 5, stacked controls"
        :step="5"
        control-variant="stacked"
      />

      <!-- decimal separator follows the Vuetify locale (this Storybook is "en", so "." elsewhere);
           it can be forced per field, here comma: typing "." is rejected, "," starts the decimals -->
      <form.Input
        name="commaPrice"
        label="Comma price (decimal-separator ,)"
        decimal-separator=","
      />

      <v-btn type="submit">
        submit
      </v-btn>
      <form.Errors />
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import * as S from "effect-app/Schema"
import { useOmegaForm } from "../../src/components/OmegaForm"

const form = useOmegaForm(
  S.Struct({
    quantity: S.Int.pipe(S.check(S.isBetween({ minimum: 1, maximum: 20 }))),
    price: S.optionalKey(S.Number),
    steps: S.optionalKey(S.Int),
    commaPrice: S.optionalKey(S.Number)
  }),
  {
    defaultValues: {
      price: 12.34
    },
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    }
  }
)
</script>
