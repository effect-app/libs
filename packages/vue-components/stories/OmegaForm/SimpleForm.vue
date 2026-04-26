<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
      {{ values }}
      <form.Input name="number" />
      <form.Input name="height" />
      <form.Input name="width" />
      <form.Input name="z" />
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

const addressNameLengthCheck = (max: number) =>
  S.makeFilter((name: string) => {
    const tooLong = name.split("\n").find((line) => line.length > max)
    return tooLong !== undefined ? `Zeile "${tooLong}" überschreitet ${max} Zeichen` : undefined
  })

const form = useOmegaForm(
  S.Struct({
    number: S.Int.pipe(S.check(S.isBetween({ minimum: 1, maximum: 20 }))),
    height: S.NonEmptyString100.pipe(S.check(S.isMinLength(10)), S.check(addressNameLengthCheck(20))),
    width: S.NonEmptyString100.pipe(S.check(S.isMinLength(10))),
    z: S.optionalKey(S.Number)
  }),
  {
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value)
    }
  }
)
</script>
