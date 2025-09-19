<template>
  <OmegaForm
    :form="form"
    :subscribe="['values']"
  >
    <template #externalForm="{ subscribedValues: { values }}">
      <form.Input
        label="title"
        name="title"
      />
      <form.Input
        label="union"
        name="union._tag"
        type="select"
        :options="[
          { title: 'A', value: 'A' },
          { title: 'B', value: 'B' }
        ]"
      />
      <form.Input
        v-if="values.union._tag === 'A'"
        label="union a value"
        name="union.a"
      />
      <form.Input
        v-else
        label="union b value"
        name="union.b"
      />
      <button>submit</button>
      <OmegaErrors />
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaErrors, OmegaForm, useOmegaForm } from "../../src/components/OmegaForm"

class A extends S.TaggedClass<A>()("A", {
  a: S.String
}) {}
class B extends S.TaggedClass<B>()("B", {
  b: S.Number
}) {}
const schema = S
  .Struct({
    title: S.String,
    union: S.Union(A, B)
  })

const defaultValues: typeof schema.Encoded = {
  title: "filicimo",
  union: { _tag: "A", a: "hello" }
}

const onSubmit = (value: typeof schema.Type) => {
  console.log(value)
}
const form = useOmegaForm(schema, {
  defaultValues,
  onSubmit: async ({value}) => onSubmit(value)
})
</script>
