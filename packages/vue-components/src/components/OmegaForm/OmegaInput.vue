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
        :meta="meta"
        v-bind="{ ...$attrs, ...$props }"
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
import { computed, inject, type Ref } from "vue"
import { useIntl } from "../../utils"
import { type FieldMeta, generateInputStandardSchemaFromFieldMeta, type OmegaInputPropsBase } from "./OmegaFormStuff"
import OmegaInternalInput from "./OmegaInternalInput.vue"

const props = defineProps<OmegaInputPropsBase<From, To>>()

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
const fallback = () => formatMessage({ id: `general.fields.${props.name}`, defaultMessage: humanize(props.name) })
const i18n = () =>
  props.form.i18nNamespace
    ? formatMessage({ id: `${props.form.i18nNamespace}.fields.${props.name}`, defaultMessage: fallback() })
    : fallback()
</script>
