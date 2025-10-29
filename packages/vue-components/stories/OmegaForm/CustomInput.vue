<template>
  <div :class="$attrs.class">
    <label :for="inputProps.id">
      <slot
        v-if="$slots.label"
        name="label"
        v-bind="{ required: inputProps.required ?? false, id: inputProps.id, label: inputProps.label }"
      />
      <template v-else>
        {{ inputProps.label }}
      </template>
    </label>
    <input
      :id="inputProps.id"
      :name="field.name"
      :value="state.value"
      :class="inputProps.inputClass"
      @change="(e: any) => field.handleChange(e.target.value)"
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

defineProps<InputProps<From, Name>>()

defineEmits<{
  (e: "focus", event: Event): void
  (e: "blur", event: Event): void
}>()

defineSlots<{
  label?: (props: { required: boolean; id: string; label: string }) => any
}>()

defineOptions({
  inheritAttrs: false
})
</script>

<style scoped>
label {
  display: block;
}

input {
  display: block;
  border: 1px solid black;
}
</style>
