<template>
  <OmegaForm :form="exampleForm">
    <OmegaInput label="aString" :form="exampleForm" name="aString" />
    <OmegaInput label="aStringMin2" :form="exampleForm" name="aStringMin2" />
    <OmegaInput
      label="aStringMin2Max4"
      :form="exampleForm"
      name="aStringMin2Max4"
    />
    <OmegaInput
      label="aStringMin2Max3Nullable"
      :form="exampleForm"
      name="aStringMin2Max3Nullable"
    />
    <OmegaInput
      label="aNumber"
      :form="exampleForm"
      name="aNumber"
      type="range"
      :step="0.1"
    />
    <OmegaInput label="aNumberMin2" :form="exampleForm" name="aNumberMin2" />
    <OmegaInput
      label="aNumberMin2Max"
      :form="exampleForm"
      name="aNumberMin2Max"
    />
    <OmegaInput
      label="aNumberMin2Max4Nullable"
      :form="exampleForm"
      name="aNumberMin2Max4Nullable"
    />
    <OmegaInput
      label="aSelect"
      :form="exampleForm"
      name="aSelect"
      :options="[
        { title: 'a', value: 'a' },
        { title: 'b', value: 'b' },
        { title: 'c', value: 'c' },
      ]"
    />
    <OmegaInput
      label="aMultiple"
      :form="exampleForm"
      name="aMultiple"
      type="autocomplete"
      :options="[
        { title: 'a', value: 'a' },
        { title: 'b', value: 'b' },
      ]"
    />
    <button>Submit</button>
    <button type="reset" @click.prevent="exampleForm.clear()">Clear</button>
    <button type="button" @click="exampleForm.reset()">Reset</button>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import {
  OmegaForm,
  OmegaInput,
  useOmegaForm,
} from "../../src/components/OmegaForm"

const exampleForm = useOmegaForm(
  S.Struct({
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
    aMultiple: S.Array(S.String),
  }),
  {
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
  },
  {
    persistency: {
      policies: ["local"],
      overrideDefaultValues: true,
    },
  },
)
</script>
