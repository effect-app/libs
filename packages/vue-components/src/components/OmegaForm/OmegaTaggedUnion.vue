<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From> | undefined = DeepKeys<From>
"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { type TaggedUnionOption } from "./InputProps"
import { type FieldPath } from "./OmegaFormStuff"
import OmegaTaggedUnionInternal from "./OmegaTaggedUnionInternal.vue"
import { type useOmegaForm } from "./useOmegaForm"

defineProps<{
  name?: Name
  form: ReturnType<typeof useOmegaForm<From, To>>
  type?: "select" | "radio"
  options: TaggedUnionOption<From, Name>[]
  label?: string
}>()
</script>

<template>
  <slot name="OmegaCustomInput">
    <form.Input
      :name="(name ? `${name}._tag` : '_tag') as FieldPath<From>"
      :label="label"
      :type="type ?? 'select'"
      :options="options"
    />
  </slot>
  <form.Field :name="(name ?? '') as any">
    <template #default="{ field, state }">
      <slot v-if="state.value" />
      <OmegaTaggedUnionInternal
        :field="field as any"
        :state="state.value"
        :name="name"
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
      </OmegaTaggedUnionInternal>
    </template>
  </form.Field>
</template>
