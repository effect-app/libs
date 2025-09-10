<template>
  <component
    :is="form.Field"
    :name="name"
    :validators="{
      onChange: schema,
      ...validators
    }"
  >
    <template #default="{ field }">
      <OmegaInternalInput
        v-if="meta"
        :field="field"
        :label="label ?? i18n()"
        :options="options"
        :meta="meta"
        :type="type"
        v-bind="$attrs"
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
  generic="From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>"
>
import { computed, inject, type Ref } from "vue"
import { type FieldMeta, generateInputStandardSchemaFromFieldMeta, type OmegaInputProps } from "./OmegaFormStuff"
import OmegaInternalInput from "./OmegaInternalInput.vue"
import { useIntl } from "../../utils";

const props = defineProps<OmegaInputProps<From, To>>()

defineOptions({
  inheritAttrs: false
})

const getMetaFromArray = inject<Ref<(name: string) => FieldMeta | null> | null>(
  "getMetaFromArray",
  null
)

const meta = computed(() => {
  if (getMetaFromArray?.value && getMetaFromArray.value(props.name)) {
    return getMetaFromArray.value(props.name)
  }
  return props.form.meta[props.name]
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
const i18n = () => props.form.i18nNamespace ? formatMessage({id:`${props.form.i18nNamespace}.inputs.${props.name}`, defaultMessage: humanize(props.name)}) : humanize(props.name)
</script>
