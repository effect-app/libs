<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <div>values: {{ values }}</div>
      <form.Input
        label="first"
        name="myUnion.first"
        type="select"
        :options="[
          { title: 'Alpha', value: 'alpha' },
          { title: 'Beta', value: 'beta' }
        ]"
      />
      <form.Input
        v-if="values.myUnion?.first === 'alpha'"
        label="alpha"
        name="myUnion.alpha"
      />
      <form.Input
        v-if="values.myUnion?.first === 'beta'"
        label="beta"
        name="myUnion.beta"
      />
      <v-btn type="submit">
        submit
      </v-btn>
      <form.Errors />
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const AlphaSchema = S.Struct({
  first: S.Literal("alpha"),
  alpha: S.String
})

const BetaSchema = S.Struct({
  first: S.Literal("beta"),
  beta: S.String
})

const MySchema = S.Struct({
  myUnion: S.Union(AlphaSchema, BetaSchema)
})

const form = useOmegaForm(MySchema, {
  onSubmit: async ({ value }) => {
    console.log(value)
  }
})
</script>
