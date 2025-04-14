<template>
  <div
    class="omega-input"
    @focusout="$emit('blur', $event)"
    @focusin="$emit('focus', $event)"
  >
    <v-checkbox
      v-if="inputProps.type === 'boolean'"
      :id="inputProps.id"
      :name="inputProps.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      ripple
      v-bind="$attrs"
      :model-value="inputProps.field.state.value"
      @change="(e: any) => inputProps.field.handleChange(e.target.checked)"
    />
    <v-text-field
      v-if="inputProps.type === 'email' || inputProps.type === 'string'"
      :id="inputProps.id"
      :required="inputProps.required"
      :min-length="inputProps.minLength"
      :max-length="inputProps.maxLength"
      :type="inputProps.type"
      :name="inputProps.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="inputProps.field.state.value"
      @update:model-value="inputProps.field.handleChange"
    />
    <v-textarea
      v-if="inputProps.type === 'text'"
      :id="inputProps.id"
      :required="inputProps.required"
      :min-length="inputProps.minLength"
      :max-length="inputProps.maxLength"
      :type="inputProps.type"
      :name="inputProps.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="inputProps.field.state.value"
      @update:model-value="inputProps.field.handleChange"
    />
    <v-text-field
      v-if="inputProps.type === 'number'"
      :id="inputProps.id"
      :required="inputProps.required"
      :min="inputProps.min"
      :max="inputProps.max"
      :type="inputProps.type"
      :name="inputProps.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="inputProps.field.state.value"
      @update:model-value="
        (e: any) => {
          inputProps.field.handleChange(Number(e))
        }
      "
    />
    <v-select
      v-if="inputProps.type === 'select' || inputProps.type === 'multiple'"
      :id="inputProps.id"
      :clearable="inputProps.type === 'select'"
      :required="inputProps.required"
      :multiple="inputProps.type === 'multiple'"
      :chips="inputProps.type === 'multiple'"
      :name="inputProps.name"
      :label="inputProps.label"
      :items="inputProps.options"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="inputProps.field.state.value"
      @clear="inputProps.field.handleChange(undefined)"
      @update:model-value="inputProps.field.handleChange"
    />

    <v-autocomplete
      v-if="
        inputProps.type === 'autocomplete' ||
        inputProps.type === 'autocompletemultiple'
      "
      :id="inputProps.id"
      :clearable="inputProps.type === 'autocomplete'"
      :multiple="inputProps.type === 'autocompletemultiple'"
      :required="inputProps.required"
      :name="inputProps.name"
      :label="inputProps.label"
      :items="inputProps.options"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      :chips="inputProps.type === 'autocompletemultiple'"
      v-bind="$attrs"
      :model-value="inputProps.field.state.value"
      @clear="inputProps.field.handleChange(undefined)"
      @update:model-value="inputProps.field.handleChange"
    />
  </div>
</template>

<script setup lang="ts" generic="T">
import type { InputProps } from "./InputProps"

defineProps<{
  inputProps: InputProps<T>
}>()

defineEmits<{
  (e: "focus", event: Event): void
  (e: "blur", event: Event): void
}>()

defineOptions({
  inheritAttrs: false,
})
</script>

<style>
.omega-input {
  .v-input__details:has(.v-messages:empty) {
    grid-template-rows: 0fr;
    transition: all 0.2s;
  }

  & .v-messages:empty {
    min-height: 0;
  }

  & .v-input__details:has(.v-messages) {
    transition: all 0.2s;
    overflow: hidden;
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr;
  }

  & .v-messages {
    transition: all 0.2s;
    > * {
      transition-duration: 0s !important;
    }
  }

  [role="alert"]:has(.v-messages:empty) {
    padding: 0;
  }

  .v-btn {
    cursor: pointer;
    padding: 0;
    width: auto;
    appearance: none;
    box-shadow: none;
    display: block;
    min-width: auto;
    height: auto;
    padding: 0.5em 0.5em 0.5em 1em;
  }
}
</style>
