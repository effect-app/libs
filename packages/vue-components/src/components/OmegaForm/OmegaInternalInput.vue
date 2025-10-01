<template>
  <slot v-bind="inputProps">
    <div
      :class="$attrs.class"
      @focusout="setRealDirty"
    >
      <OmegaInputVuetify
        v-if="vuetified"
        :input-props="inputProps"
        v-bind="$attrs"
        :vuetify-value="inputProps.field.state.value"
      />
    </div>
  </slot>
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys, useStore } from "@tanstack/vue-form"
import { computed, type ComputedRef, getCurrentInstance, onMounted, onUnmounted, ref, useId, watch, watchEffect } from "vue"
import type { InputProps, OmegaFieldInternalApi } from "./InputProps"
import type { FieldValidators, MetaRecord, NestedKeyOf, TypeOverride } from "./OmegaFormStuff"
import OmegaInputVuetify from "./OmegaInputVuetify.vue"

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  field: OmegaFieldInternalApi<From, Name>
  meta: MetaRecord<From>[NestedKeyOf<From>]
  label: string
  options?: { title: string; value: string }[]
  type?: TypeOverride
  validators?: FieldValidators<From>
}>()

const instance = getCurrentInstance()
const vuetified = instance?.appContext.components["VTextField"]

const id = useId()

const fieldApi = props.field

const fieldState = useStore(fieldApi.store, (state) => state)

const fieldType = computed(() => {
  if (props.type) return props.type
  if (props.meta?.type === "string") {
    if (props.meta.format === "email") return "email"
    return "string"
  }
  return props.meta?.type || "unknown"
})

const fieldValue = computed(() => fieldState.value.value)
// workaround strange tanstack form issue where the errors key becomes undefined ???
const _errors = computed(() => fieldState.value.meta.errors ?? [])
const errors = computed(() =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _errors.value.map((e: any) => e?.message).filter(Boolean)
)

const isFalsyButNotZero = (value: unknown): boolean => {
  return value == null || value === false || value === "" || Number.isNaN(value)
}

// we remove value and errors when the field is empty and not required

// convert nullish value to null or undefined based on schema
const handleChange: OmegaFieldInternalApi<From, Name>["handleChange"] = (value) => {
  if (isFalsyButNotZero(value) && props.meta?.type !== "boolean") {
    props.field.handleChange(
      props.meta?.nullableOrUndefined === "undefined"
        ? undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : null as any
    )
  } else {
    props.field.handleChange(value)
  }
}

// TODO: it would be cleaner when default values are handled in the form initialization via Schema or by the one using the form component..
onMounted(() => {
  if (
    !fieldValue.value
    && !props.meta?.required
    && props.meta?.nullableOrUndefined === "null"
  ) {
    const isDirty = fieldState.value.meta.isDirty
    fieldApi.setValue(null as any)
    // make sure we restore the previous dirty state..
    fieldApi.setMeta((_) => ({ ..._, isDirty }))
  }
})

const { mapError, removeError, showErrors, showErrorsOn } = (props.field.form as any).errorContext // todo; update types to include extended Omega Form props

const realDirty = ref(false)

watchEffect(() => {
  if (showErrors.value || showErrorsOn === "onChange") {
    realDirty.value = true
  }
})

const setRealDirty = () => {
  realDirty.value = true
}

onMounted(() => {
  if (fieldValue.value) {
    setRealDirty()
  }
})

const showedErrors = computed(() => {
  // single select field can be validated on change
  if (!realDirty.value && fieldType.value !== "select") return []
  return errors.value
})

watch(
  _errors,
  (errors) => {
    if (errors.length) {
      mapError({
        inputId: id,
        errors: fieldState
          .value
          .meta
          .errors
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => e.message)
          .filter(Boolean),
        label: props.label
      })
    } else {
      removeError(id)
    }
  }
)

onUnmounted(() => {
  removeError(id)
})

const inputProps: ComputedRef<InputProps<From, Name>> = computed(() => ({
  id,
  required: props.meta?.required,
  minLength: props.meta?.type === "string" && props.meta?.minLength,
  maxLength: props.meta?.type === "string" && props.meta?.maxLength,
  max: props.meta?.type === "number" && props.meta?.maximum,
  min: props.meta?.type === "number" && props.meta?.minimum,
  name: props.field.name,
  modelValue: props.field.state.value,
  handleChange,
  errorMessages: showedErrors.value,
  error: !!showedErrors.value.length,
  field: props.field,
  setRealDirty,
  type: fieldType.value,
  label: `${props.label}${props.meta?.required ? " *" : ""}`,
  options: props.options
}))
</script>
