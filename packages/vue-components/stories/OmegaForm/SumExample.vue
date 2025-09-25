<template>
  <addForm.Form>
    <addForm.Input
      label="first"
      name="first"
    />
    <div>+</div>
    <addForm.Input
      label="second"
      name="second"
    />
  </addForm.Form>

  <!-- Technically you can do this only with a subscribe but only inside OmegaForm Context -->
  <div>
    <div>Sum: {{ sum }}</div>
  </div>
</template>

<script setup lang="ts">
import { S } from "effect-app"
import { ref, watch } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const sum = ref(0)
const AddSchema = S.Struct({
  first: S.Number,
  second: S.Number
})

const addForm = useOmegaForm(AddSchema, {
  defaultValues: {
    first: 0,
    second: 0
  }
})

const values = addForm.useStore(({ values }) => values)

watch(values, ({ first, second }) => {
  sum.value = first + second
})
</script>
