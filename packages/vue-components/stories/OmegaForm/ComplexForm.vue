<template>
  <OmegaForm v-bind="args">
    <template #default="{ form }">
      <OmegaInput label="aString" :form="form" name="aString" />
      <OmegaInput label="aStringMin2" :form="form" name="aStringMin2" />
      <OmegaInput label="aStringMin2Max4" :form="form" name="aStringMin2Max4" />
      <OmegaInput
        label="aStringMin2Max3Nullable"
        :form="form"
        name="aStringMin2Max3Nullable"
      />
      <OmegaInput label="aNumber" :form="form" name="aNumber" />
      <OmegaInput label="aNumberMin2" :form="form" name="aNumberMin2" />
      <OmegaInput label="aNumberMin2Max" :form="form" name="aNumberMin2Max" />
      <OmegaInput
        label="aNumberMin2Max4Nullable"
        :form="form"
        name="aNumberMin2Max4Nullable"
      />
      <OmegaInput
        label="aSelect"
        :form="form"
        name="aSelect"
        :options="[
          { title: 'a', value: 'a' },
          { title: 'b', value: 'b' },
          { title: 'c', value: 'c' },
        ]"
      />
      <button>Submit</button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput } from "../../components/OmegaForm"

const args = {
  schema: S.Struct({
    aString: S.String,
    aStringMin2: S.String.pipe(S.minLength(2)),
    aStringMin2Max4: S.String.pipe(S.minLength(2)).pipe(S.maxLength(4)),
    aStringMin2Max3Nullable: S.UndefinedOr(
      S.String.pipe(S.minLength(2)).pipe(S.maxLength(3)),
    ),
    aNumber: S.Number,
    aNumberMin2: S.Number.pipe(S.greaterThan(2)),
    aNumberMin2Max: S.Number.pipe(S.greaterThan(2)).pipe(S.lessThan(4)),
    aNumberMin2Max4Nullable: S.NullOr(S.Number.pipe(S.between(2, 4))),
    aSelect: S.Union(S.Literal("a"), S.Literal("b"), S.Literal("c")),
  }),
  onSubmit: ({
    value,
  }: {
    value: {
      aString: string
      aStringMin2: string
      aStringMin2Max4: string
      aStringMin2Max3Nullable?: string
      aNumber: number
      aNumberMin2: number
      aNumberMin2Max: number
      aNumberMin2Max4Nullable: number | null
      aSelect: "a" | "b" | "c"
    }
  }) => {
    console.log(value)
  },
}
</script>
