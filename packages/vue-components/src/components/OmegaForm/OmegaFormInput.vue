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
  NestedKeyOf,
  TypeOverride,
  FormType,
  MetaRecord,
} from "./OmegaFormStuff"
import type { InputProps } from "./InputProps"
import OmegaInput from "./OmegaInput.vue"
import { OmegaFormKey } from "./useOmegaForm"

const form = inject(OmegaFormKey) as FormType<From, To> & {
  meta: MetaRecord<To>
}
if (!form) {
  throw new Error("OmegaFormInput must be used within an OmegaForm context")
}

defineProps<{
  name: NestedKeyOf<To>
  label: string
  validators?: FieldValidators<From>
  options?: { title: string; value: string }[]
  type?: TypeOverride
}>()

defineSlots<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: InputProps<To>) => any
}>()
</script>
