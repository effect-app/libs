<template>
  <OmegaInput
    v-bind="$props"
    :form="form"
    :name="name"
    :label="label"
    :validators="validators"
    :options="options"
    :type="type"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps"></slot>
    </template>
  </OmegaInput>
</template>

<script setup lang="ts" generic="From, To extends Record<PropertyKey, any>">
import { inject } from "vue"
import type {
  FieldValidators,
  TypeOverride,
  OmegaInputProps,
} from "./OmegaFormStuff"
import type { InputProps } from "./InputProps"
import OmegaInput from "./OmegaInput.vue"
import { OmegaFormKey } from "./useOmegaForm"
import { DeepKeys } from "@tanstack/vue-form"

const form = inject(OmegaFormKey) as unknown as OmegaInputProps<From, To>['form']
 
if (!form) {
  throw new Error("OmegaFormInput must be used within an OmegaForm context")
}

defineProps<{
  name: DeepKeys<From>
  label: string
  validators?: FieldValidators<From>
  options?: { title: string; value: string }[]
  type?: TypeOverride
}>()

defineSlots<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: InputProps<From, To>
}>()
</script>
