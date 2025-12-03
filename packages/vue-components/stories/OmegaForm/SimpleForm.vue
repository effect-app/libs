<template>
  <stocazzo.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      {{ values }}
      <stocazzo.TaggedUnion
        label="select"
        :options="[{
          title: 'cazzoPippo',
          value: 'cazzoPippo'
        }, {
          title: 'Pippocazzo',
          value: 'Pippocazzo'
        }]"
      >
        <stocazzo.Input name="a.height" />
        <stocazzo.Input name="a.width" />
        <template #Pippocazzo>
          <stocazzo.Input name="a.y" />
        </template>
        <template #cazzoPippo>
          <stocazzo.Input name="a.z" />
        </template>
        <v-btn type="submit">
          ciao
        </v-btn>
      </stocazzo.TaggedUnion>
      <stocazzo.Errors />
    </template>
  </stocazzo.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const stocazzo = useOmegaForm(
  S.Union(
    S.Struct({
      a: S.Struct({
        height: S.NonEmptyString100.pipe(S.minLength(10)),
        width: S.NonEmptyString100.pipe(S.minLength(10)),
        z: S.NonEmptyString100.pipe(S.minLength(10))
      }),
      _tag: S.Literal("cazzoPippo")
    }),
    S.Struct({
      a: S.Struct({
        height: S.NonNegativeInt.pipe(S.greaterThan(11)),
        width: S.NonNegativeInt.pipe(S.greaterThan(11)),
        y: S.NonNegativeInt.pipe(S.greaterThan(11))
      }),
      _tag: S.Literal("Pippocazzo")
    })
  )
)
</script>
