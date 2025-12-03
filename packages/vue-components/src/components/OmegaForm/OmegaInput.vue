<template>
  <component
    :is="form.Field"
    :name="name"
    :validators="{
      onChange: schema,
      ...validators
    }"
  >
    <template #default="{ field, state }">
      <OmegaInternalInput
        v-if="meta"
        v-bind="{ ...$attrs, ...$props, inputClass: computedClass }"
        :field="field"
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
import { type DeepKeys } from "@tanstack/vue-form"
import { computed, inject, type Ref, useAttrs } from "vue"
import { useIntl } from "../../utils"
import { type FieldMeta, generateInputStandardSchemaFromFieldMeta, type OmegaInputPropsBase } from "./OmegaFormStuff"
import OmegaInternalInput from "./OmegaInternalInput.vue"
import { useErrorLabel } from "./useOmegaForm"

const props = defineProps<OmegaInputPropsBase<From, To, Name>>()

// downgrade to *as* DeepKeys<From> to avoid useless and possible infinite recursion in TS
const propsName = computed(() => props.name as DeepKeys<From>)

defineSlots<{
  label?: (props: { required?: boolean; id: string; label: string }) => any
  default?: (props: any) => any
}>()

defineOptions({
  inheritAttrs: false
})

const attrs = useAttrs()

// Compute the class to use based on inputClass prop
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

// Call useIntl during setup to avoid issues when computed re-evaluates
const { trans } = useIntl()

const schema = computed(() => {
  if (!meta.value) {
    console.log(props.name, Object.keys(props.form.meta), props.form.meta)
    throw new Error("Meta is undefined")
  }
  return generateInputStandardSchemaFromFieldMeta(meta.value, trans)
})

const errori18n = useErrorLabel(props.form)
</script>
