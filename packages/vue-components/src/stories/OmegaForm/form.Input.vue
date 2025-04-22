<template>
  <OmegaForm :form="form">
    <template #default="{ form }">
      <form.Input label="aString" name="aString" />
      <form.Input label="aStringMin2" name="aStringMin2" />
      <form.Input label="aStringMin2Max4" name="aStringMin2Max4" />
      <form.Input
        label="aStringMin2Max3Nullable"
        name="aStringMin2Max3Nullable"
      />
      <form.Input label="aNumber" name="aNumber" />
      <form.Input label="aNumberMin2" name="aNumberMin2" />
      <form.Input label="aNumberMin2Max" name="aNumberMin2Max" />
      <form.Input
        label="aNumberMin2Max4Nullable"
        name="aNumberMin2Max4Nullable"
      />
      <form.Input
        label="aSelect"
        name="aSelect"
        :options="[
          { title: 'a', value: 'a' },
          { title: 'b', value: 'b' },
          { title: 'c', value: 'c' },
        ]"
      />
      <button>Submit</button>
      <button type="reset" @click.prevent="form.clear()">Clear</button>
      <button type="button" @click="form.reset()">Reset</button>
    </template>
  </OmegaForm>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, useOmegaForm } from "../../components/OmegaForm"

const form = useOmegaForm(
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
