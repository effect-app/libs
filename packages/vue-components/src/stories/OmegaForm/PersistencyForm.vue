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
      <br />
      <hr />
      <br />
      <OmegaInput label="third.fourth" :form="form" name="third.fourth" />
      <OmegaInput label="third.fifth" :form="form" name="third.fifth" />
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
  third: S.Struct({
    fourth: S.Number,
    fifth: S.Number,
  }),
})

const addForm = useOmegaForm(
  AddSchema,
  {},
  {
    persistency: {
      policies: ["session", "querystring"],
      keys: ["first", "third.fourth"],
    },
  },
)

const values = addForm.useStore(({ values }) => values)

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
