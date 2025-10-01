<template>
  <form.Form :subscribe="['values']">
    <template #default="{ subscribedValues: { values } }">
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
      <v-btn type="submit">
        submit
      </v-btn>
      <form.Errors />
    </template>
  </form.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { watch } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

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
  console.log("submit", value)
}
const form = useOmegaForm(schema, {
  defaultValues,
  onSubmit: async ({ value }) => onSubmit(value)
})

// to reset the error state, it however doesn't work
// if you one time get union b error into the error state
// then try to submit a valid union a, you get an error about b.
// test; try to reset form when union type changes.
// sadly doesn't help :S
const values = form.useStore((_) => _.values)
watch(values, (cur, prev) => {
  if (cur.union._tag !== prev.union._tag) {
    console.log("resetting form")
    form.reset(cur)
  }
}, { deep: true })
</script>
