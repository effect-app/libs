<template>
  <form.Form :subscribe="['values', 'canSubmit']">
    <template #default="{ subscribedValues: { values, canSubmit } }">
      {{ canSubmit }}
      <form.Input
        label="aString"
        name="aString"
      />
      <form.TaggedUnion
        name="union"
        label="Union!"
        :options="[
          { value: null, title: 'Select one' },
          { value: 'A', title: 'Option 1' },
          { value: 'B', title: 'Option 2' }
        ]"
      >
        <form.Input
          name="union.common"
          label="Common Field"
        />
        <template #A>
          <form.Input
            name="union.a"
            label="A Field"
          />
        </template>
        <template #B>
          <form.Input
            name="union.b"
            label="B Field"
          />
        </template>
      </form.TaggedUnion>
      <pre>{{ values }}</pre>
      <form.Errors />
      <v-btn type="submit">
        Submit
      </v-btn>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(
  S.Struct({
    aString: S.UndefinedOr(S.String),
    union: S.NullOr(
      S.Union(
        S.Struct({
          a: S.NonEmptyString,
          common: S.String,
          _tag: S.Literal("A")
        }),
        S.Struct({
          b: S.Number,
          common: S.String,
          _tag: S.Literal("B")
        })
      )
    )
  }),
  {
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    }
  }
)
</script>
