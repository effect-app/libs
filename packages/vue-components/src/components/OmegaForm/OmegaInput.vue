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
        :label="label ?? i18n()"
        :meta="meta"
      >
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
  generic="
  // dprint ignore - somehow with 120 chars, this becomes a mess. should report it.
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>
"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { computed, inject, type Ref, useAttrs } from "vue"
import { useIntl } from "../../utils"
import { type FieldMeta, generateInputStandardSchemaFromFieldMeta, type OmegaInputPropsBase } from "./OmegaFormStuff"
import OmegaInternalInput from "./OmegaInternalInput.vue"

const props = defineProps<OmegaInputPropsBase<From, To>>()

// downgrade to DeepKeys<From> to avoid useless and possible infinite recursion in TS
const propsName: Ref<DeepKeys<From>> = computed(() => props.name)

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
  if (getMetaFromArray?.value && getMetaFromArray.value(props.name)) {
    return getMetaFromArray.value(propsName.value)
  }
  return props.form.meta[propsName.value]
})

const schema = computed(() => {
  if (!meta.value) {
    console.log(props.name, Object.keys(props.form.meta), props.form.meta)
    throw new Error("Meta is undefined")
  }
  return generateInputStandardSchemaFromFieldMeta(meta.value)
})

const { formatMessage } = useIntl()
const humanize = (str: string) => {
  return str
    .replace(/([A-Z])/g, " $1") // Add space before capital letters
    .replace(/^./, (char) => char.toUpperCase()) // Capitalize the first letter
    .trim() // Remove leading/trailing spaces
}
const fallback = () =>
  formatMessage
    ? formatMessage({ id: `general.fields.${propsName.value}`, defaultMessage: humanize(props.name) })
    : humanize(props.name)
const i18n = () =>
  props.form.i18nNamespace
    ? formatMessage({ id: `${props.form.i18nNamespace}.fields.${propsName.value}`, defaultMessage: fallback() })
    : fallback()
</script>
