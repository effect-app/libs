<template>
  <OmegaForm :form="addForm">
    <template #default="{ form }">
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
  second: S.Number,
})

const addForm = useOmegaForm(AddSchema, {
  defaultValues: {
    first: 0,
    second: 0,
  },
})

const values = addForm.useStore(({ values }) => values)

watch(values, ({ first, second }) => {
  sum.value = first + second
})
</script>
