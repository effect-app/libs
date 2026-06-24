<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <pre>{{ values }}</pre>

      <!-- new type: renders RatingInput -->
      <form.Input
        name="score"
        type="rating"
        label="Score"
      />

      <!-- overridden built-in: string fields use CustomInput -->
      <form.Input
        name="nickname"
        label="Nickname"
      />

      <!-- not registered: built-in renderer -->
      <form.Input
        name="age"
        label="Age"
      />

      <v-btn type="submit">
        submit
      </v-btn>
      <form.Errors />
    </template>
  </form.Form>

  <!--
    Type-only guards (never rendered): vue-tsc checks template branches regardless
    of `v-if`, so these `@vue-expect-error` lines fail the build on a regression.
  -->
  <template v-if="false">
    <!-- built-ins stay valid alongside a registry -->
    <form.Input
      name="nickname"
      type="select"
      :options="[{ title: 'a', value: 1 }]"
    />
    <!-- @vue-expect-error unregistered type is rejected -->
    <form.Input
      name="nickname"
      type="unregistered"
    />
    <!-- no-config: built-ins valid... -->
    <plainForm.Input
      name="x"
      type="search"
    />
    <!-- ...bogus custom type rejected -->
    <!-- @vue-expect-error -->
    <plainForm.Input
      name="x"
      type="totally-bogus-type"
    />
    <!-- createUseFormWithCustomInput threads the registry into the typed `type` union too -->
    <customForm.Input
      name="x"
      type="rating"
    />
    <!-- @vue-expect-error -->
    <customForm.Input
      name="x"
      type="totally-bogus-type"
    />
  </template>
</template>

<script setup lang="ts">
import * as S from "effect-app/Schema"
import { createUseFormWithCustomInput, useOmegaForm } from "../../src/components/OmegaForm"
import CustomInput from "./CustomInput.vue"
import RatingInput from "./RatingInput.vue"

// `inputs` keys are inferred into the `type` union (`type="rating"` is valid here).
const form = useOmegaForm(
  S.Struct({
    score: S.Number,
    nickname: S.String,
    age: S.Number
  }),
  {
    defaultValues: { score: 0, nickname: "", age: 0 },
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    }
  },
  {
    inputs: {
      rating: RatingInput,
      string: CustomInput
    }
  }
)

// No-config form for the guards above: its `type` union must stay built-ins only.
const plainForm = useOmegaForm(S.Struct({ x: S.String }))

// createUseFormWithCustomInput: universal CustomInput as default + per-type override,
// with the same typed `type` inference from `inputs`.
const customForm = createUseFormWithCustomInput(CustomInput)(
  S.Struct({ x: S.String }),
  undefined,
  { inputs: { rating: RatingInput } }
)
</script>
