<template>
  <div :class="$attrs.class">
    <label :for="inputProps.id">{{ inputProps.label }}</label>
    <div class="stars">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        :aria-pressed="Number(state.value) >= n"
        @click="field.handleChange(n as never)"
      >
        {{ Number(state.value) >= n ? "★" : "☆" }}
      </button>
    </div>
    <span
      v-for="msg in inputProps.errorMessages"
      :key="msg"
      class="error"
    >{{ msg }}</span>
  </div>
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys } from "@tanstack/vue-form"
// `OmegaRendererProps` is the public contract for registered `omegaConfig.inputs` components.
import type { OmegaRendererProps } from "../../src/components/OmegaForm"

defineProps<OmegaRendererProps<From, Name>>()

defineOptions({ inheritAttrs: false })
</script>

<style scoped>
.stars button {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.4rem;
}

.error {
  color: yellow;
  display: block;
}
</style>
