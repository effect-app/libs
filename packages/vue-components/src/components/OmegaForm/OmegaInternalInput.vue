<template>
  <slot v-bind="inputProps">
    <OmegaInputVuetify
      v-if="vuetified"
      :input-props="inputProps"
      v-bind="$attrs"
    />
  </slot>
</template>

<script setup lang="ts" generic="To">
import { useStore } from "@tanstack/vue-form"
import {
  useAttrs,
  useId,
  computed,
  watch,
  onMounted,
  ref,
  watchEffect,
  type ComputedRef,
  getCurrentInstance,
} from "vue"
import type {
  FieldValidators,
  MetaRecord,
  NestedKeyOf,
  TypeOverride,
} from "./OmegaFormStuff"
import { useOmegaErrors } from "./OmegaErrorsContext"
import type { OmegaFieldInternalApi, InputProps } from "./InputProps"
import OmegaInputVuetify from "./OmegaInputVuetify.vue"

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  field: OmegaFieldInternalApi<To>
  meta: MetaRecord<To>[NestedKeyOf<To>]
  label: string
  options?: { title: string; value: string }[]
  type?: TypeOverride
  validators?: FieldValidators<To>
}>()

const instance = getCurrentInstance()
const vuetified = instance?.appContext.components["VTextField"]

const id = useId()

const fieldApi = props.field

const fieldState = useStore(fieldApi.store, state => state)

const fieldType = computed(() => {
  if (props.type) return props.type
  if (props.meta?.type === "string") {
    if (props.meta.format === "email") return "email"
    return "string"
  }
  return props.meta?.type || "unknown"
})

const fieldValue = computed(() => fieldState.value.value)
const errors = computed(() =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldState.value.meta.errors.map((e: any) => e?.message).filter(Boolean),
)

// we remove value and errors when the field is empty and not required
//watchEffect will trigger infinite times with both free fieldValue and errors, so bet to watch a stupid boolean
watch(
  () => [!!fieldValue.value],
  () => {
    if (errors.value.length && !fieldValue.value && !props.meta?.required) {
      fieldApi.setValue(
        props.meta?.nullableOrUndefined === "undefined" ? undefined : null,
      )
    }
  },
)

onMounted(() => {
  if (
    !fieldValue.value &&
    !props.meta?.required &&
    props.meta?.nullableOrUndefined === "null"
  ) {
    fieldApi.setValue(null)
  }
})

const realDirty = ref(false)
const setRealDirty = () => {
  realDirty.value = true
}

const { addError, formSubmissionAttempts, removeError } = useOmegaErrors()

watchEffect(() => {
  if (formSubmissionAttempts.value > 0) {
    realDirty.value = true
  }
})

const showedErrors = computed(() => {
  // single select field can be validated on change
  if (!realDirty.value && fieldType.value !== "select") return []
  return errors.value
})

watch(
  () => fieldState.value.meta.errors,
  () => {
    if (fieldState.value.meta.errors.length) {
      addError({
        inputId: id,
        errors: fieldState.value.meta.errors
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => e.message)
          .filter(Boolean),
        label: props.label,
      })
    } else {
      removeError(id)
    }
  },
)

const otherAttrs = useAttrs()

const inputProps: ComputedRef<InputProps<To>> = computed(() => ({
  id,
  required: props.meta?.required,
  minLength: props.meta?.type === "string" && props.meta?.minLength,
  maxLength: props.meta?.type === "string" && props.meta?.maxLength,
  max: props.meta?.type === "number" && props.meta?.maximum,
  min: props.meta?.type === "number" && props.meta?.minimum,
  name: props.field.name,
  modelValue: props.field.state.value,
  errorMessages: showedErrors.value,
  error: !!showedErrors.value.length,
  field: props.field,
  setRealDirty,
  type: fieldType.value,
  label: `${props.label}${props.meta?.required ? " *" : ""}`,
  options: props.options,
}))
</script>
