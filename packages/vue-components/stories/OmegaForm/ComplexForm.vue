<template>
  <exampleForm.Form>
    <div>isDirty: {{ isDirty }}</div>
    <exampleForm.Input
      label="aString"
      name="aString"
    />
    <exampleForm.Input
      label="aStringMin2"
      name="aStringMin2"
    />
    <exampleForm.Input
      label="aStringMin2Max4"
      name="aStringMin2Max4"
    />
    <exampleForm.Input
      label="aStringMin2Max3Optional"
      name="aStringMin2Max3Optional"
    />
    <exampleForm.Input
      label="aNumber"
      name="aNumber"
      type="range"
      :step="0.1"
    />
    <exampleForm.Input
      label="aNumberMin2"
      name="aNumberMin2"
    />
    <exampleForm.Input
      label="aNumberMin2Max"
      name="aNumberMin2Max"
    />
    <exampleForm.Input
      label="aNumberMin2Max4Nullable"
      name="aNumberMin2Max4Nullable"
      clearable
    />
    <exampleForm.Input
      label="aSelect"
      name="aSelect"
      :options="[
        { title: 'a', value: 'a' },
        { title: 'b', value: 'b' },
        { title: 'c', value: 'c' }
      ]"
    />
    <exampleForm.Input
      label="aMultiple"
      name="aMultiple"
      type="autocomplete"
      :options="[
        { title: 'a', value: 'a' },
        { title: 'b', value: 'b' }
      ]"
    />
    <button>Submit</button>
    <button
      type="reset"
      @click.prevent="exampleForm.clear()"
    >
      Clear
    </button>
    <button
      type="button"
      @click="exampleForm.reset()"
    >
      Reset
    </button>
    <exampleForm.Errors />
  </exampleForm.Form>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { useOmegaForm } from "../../src/components/OmegaForm"

const exampleForm = useOmegaForm(
  S.Struct({
    aString: S.String,
    aStringMin2: S.String.pipe(S.minLength(2)),
    aStringMin2Max4: S.String.pipe(S.minLength(2)).pipe(S.maxLength(4)),
    aStringMin2Max3Optional: S.UndefinedOr(
      S.String.pipe(S.minLength(2)).pipe(S.maxLength(3))
    ),
    aNumber: S.Number,
    aNumberMin2: S.Number.pipe(S.greaterThan(2)),
    aNumberMin2Max: S.Number.pipe(S.greaterThan(2)).pipe(S.lessThan(4)),
    aNumberMin2Max4Nullable: S.NullOr(S.Number.pipe(S.between(2, 4))),
    aSelect: S.Union(S.Literal("a"), S.Literal("b"), S.Literal("c")),
    aMultiple: S.Array(S.String)
  }),
  {
    onSubmit: async ({
      value
    }: {
      value: {
        aString: string
        aStringMin2: string
        aStringMin2Max4: string
        aStringMin2Max3Optional?: string
        aNumber: number
        aNumberMin2: number
        aNumberMin2Max: number
        aNumberMin2Max4Nullable: number | null
        aSelect: "a" | "b" | "c"
      }
    }) => {
      console.log(value)
    }
  },
  {
    persistency: {
      policies: ["local"],
      overrideDefaultValues: true
    }
  }
)
const isDirty = exampleForm.useStore((_) => _.isDirty)
</script>
