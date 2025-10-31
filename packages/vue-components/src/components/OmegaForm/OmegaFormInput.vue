<template>
  <OmegaInput
    v-bind="$props"
    :form="form"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </OmegaInput>
</template>

<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { inject } from "vue"
import type { MergedInputProps } from "./InputProps"
import type { BaseProps, DefaultTypeProps, OmegaInputProps } from "./OmegaFormStuff"
import OmegaInput from "./OmegaInput.vue"
import { OmegaFormKey } from "./useOmegaForm"

const form = inject(OmegaFormKey) as unknown as OmegaInputProps<
  From,
  To
>["form"]

if (!form) {
  throw new Error("OmegaFormInput must be used within an OmegaForm context")
}

defineProps<
  BaseProps<From> & DefaultTypeProps
>()

defineSlots<{
  default(props: MergedInputProps<From, Name>): void
}>()
</script>
