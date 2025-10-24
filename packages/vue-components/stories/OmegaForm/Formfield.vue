<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      <form.Input
        label="aString"
        name="aString"
      />
      <form.Fieldset
        name="union"
        label="Union!"
        :options="[
          { value: 'A', title: 'Option 1' },
          { value: 'B', title: 'Option 2' },
          { value: null, title: 'Option 3' }
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
      </form.Fieldset>
      <pre>{{ values }}</pre>
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src"

const form = useOmegaForm(S.Struct({
  aString: S.UndefinedOr(S.String),
  union: S.NullOr(
    S.Union(
      S.Struct({
        a: S.String,
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
}))
</script>
