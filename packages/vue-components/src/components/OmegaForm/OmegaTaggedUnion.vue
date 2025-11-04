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
  <form.Field :name="(name ? `${name}._tag` : '_tag') as any">
    <template #default="inputProps">
      <slot
        name="OmegaCustomInput"
        v-bind="inputProps"
      >
        <form.Input
          :name="(name ? `${name}._tag` : '_tag') as FieldPath<From>"
          :label="label"
          :type="type ?? 'select'"
          :options="options"
        />
      </slot>
      <slot />
      <slot
        v-if="inputProps.state.value"
        name="OmegaCommon"
      />
      <OmegaTaggedUnionInternal
        :field="inputProps.field as any"
        :state="inputProps.state.value"
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
