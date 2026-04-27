<template>
  <component
    :is="form.Field"
    :key="fieldKey"
    :name="name"
    :validators="{
      ...validators,
      onSubmit: schema
    }"
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
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
"
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

// Key to force Field re-mount when meta type changes (for TaggedUnion support)
const fieldKey = computed(() => {
  const m = meta.value
  if (!m) return propsName.value
  // Include type and key constraints in the key so Field re-mounts when validation rules change
  // Cast to any since not all FieldMeta variants have these properties
  const fm = m as any
  return `${propsName.value}-${fm.type}-${fm.minLength ?? ""}-${fm.maxLength ?? ""}-${fm.minimum ?? ""}-${
    fm.maximum ?? ""
  }`
})

// Call useIntl during setup to avoid issues when computed re-evaluates
const { trans } = useIntl()

const hasIssues = (result: any): boolean => Array.isArray(result?.issues) && result.issues.length > 0

const composeStandardSchemas = (
  omegaSchema: any,
  originalSchema: any
) => ({
  "~standard": {
    ...omegaSchema["~standard"],
    validate: (value: unknown) => {
      const omegaResult = omegaSchema["~standard"].validate(value)
      if (omegaResult && typeof omegaResult.then === "function") {
        return omegaResult.then((resolved: any) => {
          if (hasIssues(resolved)) {
            return resolved
          }
          return originalSchema["~standard"].validate(value)
        })
      }

      if (hasIssues(omegaResult)) {
        return omegaResult
      }

      return originalSchema["~standard"].validate(value)
    }
  }
})

const schema = computed(() => {
  if (!meta.value) {
    console.log(props.name, Object.keys(props.form.meta), props.form.meta)
    throw new Error("Meta is undefined")
  }
  const omegaSchema = generateInputStandardSchemaFromFieldMeta(meta.value, trans)
  const fieldSchema = meta.value.originalSchema
  if (fieldSchema) {
    return composeStandardSchemas(omegaSchema, fieldSchema)
  }
  return omegaSchema
})

const errori18n = useErrorLabel(props.form)
</script>
