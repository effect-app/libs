<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
"
>
import { type DeepKeys, type DeepValue } from "@tanstack/vue-form"
import { onMounted } from "vue"
import { type FieldsetOption } from "./InputProps"
import OmegaFieldsetInternal from "./OmegaFieldsetInternal.vue"
import { type Leaves } from "./OmegaFormStuff"
import { type useOmegaForm } from "./useOmegaForm"

const props = defineProps<{
  name: Name
  form: ReturnType<typeof useOmegaForm<From, To>>
  type?: "select" | "radio"
  options: ReadonlyArray<FieldsetOption<From, Name>>
  label?: string
}>()

// Initialize the union field to null if it's undefined and nullable
onMounted(() => {
  const currentValue = props.form.getFieldValue(props.name)
  const meta = props.form.meta[props.name as keyof typeof props.form.meta]

  if (currentValue === undefined && meta?.nullableOrUndefined === "null") {
    // Initialize to null for nullable unions
    props.form.setFieldValue(props.name, null as DeepValue<From, Name>)
  }
})
</script>

<template>
  <form.Input
    :name="`${name}._tag` as Leaves<From, ''>"
    :label="label"
    :type="type ?? 'select'"
    :options="options as FieldsetOption<From, Name>[]"
  />
  <slot />
  <form.Field :name="name">
    <template #default="{ field, state }">
      <OmegaFieldsetInternal
        :field="field as any"
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
