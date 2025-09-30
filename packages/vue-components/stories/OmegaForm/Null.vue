<template>
  <exampleForm.Form>
    <div>isDirty: {{ isDirty }}</div>
    <exampleForm.Input
      label="aString"
      name="aString"
    />
    <exampleForm.Input
      label="aStringMin2Max3Optional"
      name="aStringMin2Max3Optional"
    />
    <exampleForm.Input
      label="aNumberMin2Max4Nullable"
      name="aNumberMin2Max4Nullable"
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
import { watch } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const exampleForm = useOmegaForm(
  S.Struct({
    aString: S.String,
    aStringMin2Max3Optional: S.UndefinedOr(
      S.String.pipe(S.minLength(2)).pipe(S.maxLength(3))
    ),
    aNumberMin2Max4Nullable: S.NullOr(S.Number.pipe(S.between(2, 4)))
  }),
  {
    defaultValues: {
      aString: "",
      aNumberMin2Max4Nullable: null
    },
    onSubmit: async ({
      value
    }: {
      value: {
        aString: string
        aStringMin2Max3Optional?: string
        aNumberMin2Max4Nullable: number | null
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
const values = exampleForm.useStore((_) => _.values)
watch(values, (v) => {
  console.log("values changed", v)
})
</script>
