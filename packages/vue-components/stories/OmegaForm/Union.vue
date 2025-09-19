<template>
  <OmegaForm
    :schema="schema"
    :default-values="defaultValues"
    :subscribe="['values']"
    @submit="onSubmit"
  >
    <template #internalForm="{ form, subscribedValues: { values }}">
      <OmegaInput
        label="title"
        name="title"
        :form="form"
      />
      <OmegaInput
        label="union"
        name="union._tag"
        type="select"
        :options="[
          { title: 'A', value: 'A' },
          { title: 'B', value: 'B' }
        ]"
        :form="form"
      />
      <OmegaInput
        v-if="values.union._tag === 'A'"
        :form="form"
        label="union a value"
        name="union.a"
      />
      <OmegaInput
        v-else
        :form="form"
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
import { OmegaErrors, OmegaForm, OmegaInput } from "../../src/components/OmegaForm"

const schema = S
  .Struct({
    title: S.String,
    union: S.Union(S.TaggedStruct("A", { a: S.String }), S.TaggedStruct("B", { b: S.Number }))
  })

const defaultValues: typeof schema.Encoded = {
  title: "filicimo",
  union: { _tag: "A", a: "hello" }
}

const onSubmit = (value: typeof schema.Type) => {
  console.log(value)
}
</script>
