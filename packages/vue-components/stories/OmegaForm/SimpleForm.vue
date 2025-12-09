<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      {{ values }}
      <form.TaggedUnion
        label="select"
        :options="[{
          title: 'one',
          value: 'one'
        }, {
          title: 'two',
          value: 'two'
        }]"
      >
        <form.Input name="a.number" />
        <form.Input name="a.height" />
        <form.Input name="a.width" />
        <template #two>
          <form.Input name="a.y" />
        </template>
        <template #one>
          <form.Input name="a.z" />
        </template>
        <v-btn type="submit">
          ciao
        </v-btn>
      </form.TaggedUnion>
      <form.Errors />
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const form = useOmegaForm(
  S.Union(
    S.Struct({
      a: S.Struct({
        number: S.Number.pipe(S.int()).pipe(S.between(1, 20)),
        height: S.NonEmptyString100.pipe(S.minLength(10)),
        width: S.NonEmptyString100.pipe(S.minLength(10)),
        z: S.NonEmptyString100.pipe(S.minLength(10))
      }),
      _tag: S.Literal("one")
    }),
    S.Struct({
      a: S.Struct({
        number: S.Number.pipe(S.int()).pipe(S.between(1, 20)),
        height: S.NonNegativeInt.pipe(S.greaterThan(11)),
        width: S.NonNegativeInt.pipe(S.greaterThan(11)),
        y: S.NonNegativeInt.pipe(S.greaterThan(11))
      }),
      _tag: S.Literal("two")
    })
  )
)
</script>
