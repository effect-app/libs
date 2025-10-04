<template>
  <div
    class="omega-input"
    @focusout="$emit('blur', $event)"
    @focusin="$emit('focus', $event)"
  >
    <component
      :is="inputProps.type === 'boolean' ? 'v-checkbox' : 'v-switch'"
      v-if="inputProps.type === 'boolean' || inputProps.type === 'switch'"
      :id="inputProps.id"
      :name="field.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      ripple
      v-bind="$attrs"
      :model-value="field.state.value"
      @change="(e: any) => field.handleChange(e.target.checked)"
    />
    <v-text-field
      v-if="inputProps.type === 'email' || inputProps.type === 'string' || inputProps.type === 'password'"
      :id="inputProps.id"
      :required="inputProps.required"
      :min-length="inputProps.minLength"
      :max-length="inputProps.maxLength"
      :type="getInputType(inputProps.type)"
      :name="field.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="field.state.value"
      @update:model-value="field.handleChange"
    />
    <v-textarea
      v-if="inputProps.type === 'text'"
      :id="inputProps.id"
      :required="inputProps.required"
      :min-length="inputProps.minLength"
      :max-length="inputProps.maxLength"
      :name="field.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="field.state.value"
      @update:model-value="field.handleChange"
    />
    <component
      :is="inputProps.type === 'range' ? 'v-slider' : 'v-text-field'"
      v-if="inputProps.type === 'number' || inputProps.type === 'range'"
      :id="inputProps.id"
      :required="inputProps.required"
      :min="inputProps.min"
      :max="inputProps.max"
      :type="inputProps.type"
      :name="field.name"
      :label="inputProps.label"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="field.state.value"
      @update:model-value="(e: any) => {
        if (e || e === 0) {
          field.handleChange(Number(e) as any)
        } else {
          field.handleChange(undefined as any)
        }
      }"
    />
    <template v-if="inputProps.type === 'radio'">
      <v-radio-group
        :id="inputProps.id"
        :name="field.name"
        :label="inputProps.label"
        :error-messages="inputProps.errorMessages"
        :error="inputProps.error"
        v-bind="$attrs"
        :model-value="field.state.value"
        @update:model-value="field.handleChange"
      >
        <v-radio
          v-for="option in inputProps.options"
          :key="option.value"
          :label="option.title"
          :value="option.value"
        />
      </v-radio-group>
    </template>
    <v-select
      v-if="inputProps.type === 'select' || inputProps.type === 'multiple'"
      :id="inputProps.id"
      :clearable="inputProps.type === 'select'"
      :required="inputProps.required"
      :multiple="inputProps.type === 'multiple'"
      :chips="inputProps.type === 'multiple'"
      :name="field.name"
      :label="inputProps.label"
      :items="inputProps.options"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      v-bind="$attrs"
      :model-value="field.state.value"
      @clear="field.handleChange(undefined as any)"
      @update:model-value="field.handleChange"
    />

    <v-autocomplete
      v-if="inputProps.type === 'autocomplete'
      || inputProps.type === 'autocompletemultiple'"
      :id="inputProps.id"
      :clearable="inputProps.type === 'autocomplete'"
      :multiple="inputProps.type === 'autocompletemultiple'"
      :required="inputProps.required"
      :name="field.name"
      :label="inputProps.label"
      :items="inputProps.options"
      :error-messages="inputProps.errorMessages"
      :error="inputProps.error"
      :chips="inputProps.type === 'autocompletemultiple'"
      v-bind="$attrs"
      :model-value="field.state.value"
      @clear="field.handleChange(undefined as any)"
      @update:model-value="field.handleChange"
    />
  </div>
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { getInputType } from "../OmegaForm/OmegaFormStuff"
import type { VuetifyInputProps } from "./InputProps"

defineProps<VuetifyInputProps<From, Name>>()

defineEmits<{
  (e: "focus", event: Event): void
  (e: "blur", event: Event): void
}>()

defineOptions({
  inheritAttrs: false
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
