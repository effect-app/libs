<template>
  <OmegaForm
    :form="addForm"
    :subscribe="['errors', 'values']"
    show-errors-on="onChange"
  >
    <template #default="{ form, subscribedValues: { errors, values } }">
      <div>Errors: {{ errors }}</div>
      <div>Values: {{ values }}</div>
      <OmegaInput label="first" :form="form" name="first" />
      <div>+</div>
      <OmegaInput label="second" :form="form" name="second" />
    </template>
  </OmegaForm>

  <!-- Technically you can do this only with a subscribe but only inside OmegaForm Context -->
  <div>
    <div>Sum: {{ sum }}</div>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { OmegaForm, OmegaInput, useOmegaForm } from "../../components/OmegaForm"
import { ref, watch } from "vue"

const sum = ref(0)
const AddSchema = S.Struct({
  first: S.Number,
  second: S.Number.pipe(S.greaterThan(3)),
})

const addForm = useOmegaForm(
  AddSchema,
  { defaultValues: { first: 1, second: 2 } },
  {
    persistency: {
      method: "session",
      keys: ["first", "second"],
      banKeys: ["second"],
    },
  },
)

const values = addForm.useStore(({ values }) => values)
const errors = addForm.useStore(({ errors }) => errors)

console.log({ errors })

watch(values, ({ first, second }) => {
  sum.value = first + second
})

// TODO: Implement this when we have a way to persist the form values
// {
//   persist: "session",
//   persistKeys: ["riskCategoryPeriod"],
//   persistBanKeys: ["riskCategory"],
// }
</script>
