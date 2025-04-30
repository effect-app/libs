<template>
  <OmegaForm :form="testForm">
    <OmegaInput name="first" :form="testForm" label="First">
      <template #default="{ field }">
        <label for="first">First</label>
        <input
          id="first"
          v-model="field.state.value"
          type="number"
          @change="
            (e: any) => {
              field.handleChange(Number(e.target.value))
            }
          "
          @blur="field.handleBlur"
        />
      </template>
    </OmegaInput>
    <OmegaInput name="second" :form="testForm" label="Second">
      <template #default="{ field }">
        <label for="second">Second</label>
        <input
          id="second"
          v-model="field.state.value"
          type="number"
          @change="
            (e: any) => {
              field.handleChange(Number(e.target.value || '0'))
            }
          "
          @blur="field.handleBlur"
        />
      </template>
    </OmegaInput>
    <div data-testid="valuez">{{ valuez }}</div>
  </OmegaForm>
</template>

<script setup lang="ts">
import {
  OmegaForm,
  OmegaInput,
  useOmegaForm,
} from "../src/components/OmegaForm"
import * as S from "effect-app/Schema"
import { computed, watchEffect } from "vue"

const testForm = useOmegaForm(
  S.Struct({
    first: S.Number,
    second: S.Number,
  }),
)

const values = testForm.useStore(state => state.values)

watchEffect(() => {
  console.log(values.value.first + values.value.second)
})

const valuez = computed(() => values.value.first + values.value.second)
</script>
