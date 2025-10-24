<template>
  <form.Input
    :name="`${name}._tag` as Leaves<From, ''>"
    :label="label"
    :type="type ?? 'select'"
    :options="options"
  />
  <slot />
  <form.Field :name="name">
    <template #default="{ field, state }">
      <OmegaFieldsetInternal
        :field="field"
        :state="state.value"
      >
        <template
          v-for="(_, slotname) in $slots"
          #[slotname]="slotProps"
        >
          <slot
            :name="slotname"
            v-bind="slotProps"
          />
        </template>
      </OmegaFieldsetInternal>
    </template>
  </form.Field>
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
import { type NonEmptyArray } from "effect-app"
import { type FieldsetOption } from "./InputProps"
import OmegaFieldsetInternal from "./OmegaFieldsetInternal.vue"
import { type Leaves } from "./OmegaFormStuff"
import { type useOmegaForm } from "./useOmegaForm"

defineProps<{
  name: Name
  form: ReturnType<typeof useOmegaForm<From, To>>
  type?: "select" | "radio"
  options: NonEmptyArray<FieldsetOption<From, DeepKeys<From>>>
  label?: string
}>()
</script>
