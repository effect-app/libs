<template>
  <component
    :is="form.Field"
    :name="name"
    :validators="validators"
  >
    <template #default="{ field, state }">
      <OmegaInternalInput
        v-if="meta"
        v-bind="{ ...$attrs, ...$props, inputClass: computedClass }"
        :field="field as any"
        :state="state"
        :register="form.registerField"
        :label="label ?? errori18n(propsName)"
        :meta="meta"
      >
        <template
          v-if="$slots.label"
          #label="labelProps"
        >
          <slot
            name="label"
            v-bind="labelProps"
          />
        </template>
        <template #default="inputProps">
          <slot v-bind="inputProps" />
        </template>
      </OmegaInternalInput>
    </template>
  </component>
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, To extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
/* eslint-disable @typescript-eslint/no-explicit-any -- TanStack Form Field generic interop and slot prop typing */
import { type DeepKeys } from "@tanstack/vue-form"
import { computed, inject, type Ref, useAttrs } from "vue"
import { useErrorLabel } from "./errors"
import { type FieldMeta } from "./meta/types"
import OmegaInternalInput from "./OmegaInternalInput.vue"
import { type OmegaInputPropsBase } from "./types"

const props = defineProps<OmegaInputPropsBase<From, To, Name>>()

// downgrade to *as* DeepKeys<From> to avoid useless and possible infinite recursion in TS
const propsName = computed(() => props.name as DeepKeys<From>)

defineSlots<{
  label?: (props: { required?: boolean; id: string; label: string }) => any
  default?: (props: any) => any
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()

const computedClass = computed(() => {
  if (props.inputClass === null) return undefined
  if (props.inputClass !== undefined) return props.inputClass
  return attrs.class as string | undefined
})

const getMetaFromArray = inject<Ref<(name: string) => FieldMeta | null> | null>(
  "getMetaFromArray",
  null
)

const meta = computed(() => {
  if (getMetaFromArray?.value && getMetaFromArray.value(props.name as DeepKeys<From>)) {
    return getMetaFromArray.value(propsName.value)
  }
  return props.form.meta[propsName.value]
})

const errori18n = useErrorLabel(props.form)
</script>
