<template>
  <addForm.Form
    :subscribe="['errors', 'values']"
    show-errors-on="onChange"
  >
    <template #default="{ subscribedValues: { errors, values: vvv } }">
      <div>Errors: {{ errors }}</div>
      <div>Values: {{ vvv }}</div>
      <addForm.Input name="first" />
    </template>
  </addForm.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { ref, watch } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const sum = ref(0)
const AddSchema = S.Struct({
  first: S.PositiveNumber.pipe(S.withDefaultConstructor(() => S.PositiveNumber(100))),
  second: S.PositiveNumber.pipe(S.withDefaultConstructor(() => S.PositiveNumber(100))),
  third: S.NullOr(S.String).withDefault,
  fourth: S
    .Struct({
      addForm: S.NullOr(S.String).withDefault,
      b: S.PositiveNumber.pipe(S.withDefaultConstructor(() => S.PositiveNumber(100))),
      c: S.Struct({
        d: S.Number.pipe(S.withDefaultConstructor(() => 10))
      })
    }),
  fifth: S.Email,
  sixth: S.NumberFromString.pipe(S.withDefaultConstructor(() => 1000))
})

const addForm = useOmegaForm(
  AddSchema,
  {},
  {
    persistency: {
      policies: ["querystring"],
      keys: ["first"],
      overrideDefaultValues: true
    }
  }
)

const values = addForm.useStore(({ values }) => values)

watch(values, ({ first, second }) => {
  sum.value = first + second
})
</script>
