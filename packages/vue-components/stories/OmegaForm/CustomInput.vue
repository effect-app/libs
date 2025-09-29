<template>
  <div>
    <input
      :id="inputProps.name"
      :name="inputProps.name"
      :value="inputProps.field.state.value"
      @change="(e: any) => inputProps.field.handleChange(e.target.value)"
    >
  </div>
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys } from "@tanstack/vue-form"
import type { InputProps } from "../../src/components/OmegaForm/InputProps"

defineProps<{
  inputProps: InputProps<From, Name>
  vuetifyValue: unknown
}>()

defineEmits<{
  (e: "focus", event: Event): void
  (e: "blur", event: Event): void
}>()

defineOptions({
  inheritAttrs: false
})
</script>

<style>
label {
  display: block;
}

input {
  display: block;
  border: 1px solid black;
}
</style>
