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

<script setup lang="ts" generic="From extends Record<PropertyKey, any>, To extends Record<PropertyKey, any>, Name extends DeepKeys<From>">
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
  name: Name
  label: string
  validators?: FieldValidators<From>
  options?: { title: string; value: string }[]
  type?: TypeOverride
}>()

defineSlots<{
  default(props: InputProps<From, Name>): void
}>()
</script>
