<template>
  <slot v-bind="{ ...inputProps.inputProps, field: inputProps.field, state: inputProps.state }">
    <div :class="$attrs.class">
      <OmegaInputVuetify
        v-if="vuetified"
        v-bind="{ ...$attrs, ...inputProps }"
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
import { computed, type ComputedRef, getCurrentInstance, onMounted, useId } from "vue"
import type { InputProps, OmegaFieldInternalApi } from "./InputProps"
import type { FieldValidators, MetaRecord, NestedKeyOf, TypeOverride } from "./OmegaFormStuff"
import OmegaInputVuetify from "./OmegaInputVuetify.vue"

defineOptions({
  inheritAttrs: false
})

const props = withDefaults(
  defineProps<{
    field: OmegaFieldInternalApi<From, Name>
    state: OmegaFieldInternalApi<From, Name>["state"]
    meta: MetaRecord<From>[NestedKeyOf<From>]
    label: string
    type?: TypeOverride
    validators?: FieldValidators<From>
    required?: boolean

    register: (
      field: ComputedRef<{
        name: string
        label: string
        id: string
      }>
    ) => void

    // TODO: these should really be optional, depending on the input type (and the custom input type for custom inputs :s)
    options?: { title: string; value: string }[]
  }>(),
  {
    required: undefined,
    type: undefined,
    options: undefined,
    validators: undefined
  }
)

const isRequired = computed(() => props.required ?? props?.meta?.required)

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

props.register(computed(() => ({ name: props.field.name, label: props.label, id })))

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

  // whenever we change the field, regardless if we set it to null, we should reset onSubmit.
  // not sure why this is not the case in tanstack form.
  props.field.setMeta((m) => ({ ...m, errorMap: { ...m.errorMap, onSubmit: undefined } }))
}

// TODO: it would be cleaner when default values are handled in the form initialization via Schema or by the one using the form component..
onMounted(() => {
  if (
    !fieldValue.value
    && !isRequired.value
    && props.meta?.nullableOrUndefined === "null"
  ) {
    const isDirty = fieldState.value.meta.isDirty
    fieldApi.setValue(null as any)
    // make sure we restore the previous dirty state..
    fieldApi.setMeta((_) => ({ ..._, isDirty }))
  }
})

const wrapField = (field: OmegaFieldInternalApi<From, Name>) => {
  const handler3 = {
    get(_target: any, prop: PropertyKey, _receiver: any) {
      if (prop === "handleChange") {
        return handleChange
      }
      return Reflect.get(...arguments as unknown as [any, any, any])
    }
  }

  const proxy3 = new Proxy(field, handler3)
  return proxy3 as typeof field
}

const inputProps: ComputedRef<InputProps<From, Name>> = computed(() => ({
  inputProps: {
    id,
    required: isRequired.value,
    minLength: props.meta?.type === "string" && props.meta?.minLength,
    maxLength: props.meta?.type === "string" && props.meta?.maxLength,
    max: props.meta?.type === "number" && props.meta?.maximum,
    min: props.meta?.type === "number" && props.meta?.minimum,
    errorMessages: errors.value,
    error: !!errors.value.length,
    type: fieldType.value,
    label: `${props.label}${isRequired.value ? " *" : ""}`,
    options: props.options
  },

  state: props.state,
  field: wrapField(props.field)
}))
</script>
