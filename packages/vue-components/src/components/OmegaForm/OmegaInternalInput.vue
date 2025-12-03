<template>
  <slot v-bind="{ ...inputProps.inputProps, field: inputProps.field, state: inputProps.state }">
    <div :class="$attrs.class">
      <OmegaInputVuetify
        v-if="vuetified"
        v-bind="{ ...attrsWithoutClass, ...inputProps, class: props.inputClass }"
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
      </OmegaInputVuetify>
    </div>
  </slot>
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys, useStore } from "@tanstack/vue-form"
import { computed, type ComputedRef, getCurrentInstance, useAttrs, useId, useSlots } from "vue"
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
    inputClass?: string | null

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
    validators: undefined,
    inputClass: undefined
  }
)

const isRequired = computed(() => props.required ?? props?.meta?.required)

const instance = getCurrentInstance()
const vuetified = instance?.appContext.components["VTextField"]
const attrs = useAttrs()
const slots = useSlots()

// Create attrs without the class property to avoid duplication
const attrsWithoutClass = computed(() => {
  const { class: _, ...rest } = attrs
  return rest
})

const id = useId()

const fieldApi = props.field

const fieldState = useStore(fieldApi.store, (state) => state)

// Get errors from form-level fieldMeta (persists across Field re-mounts)
const formFieldMeta = useStore(fieldApi.form.store, (state) => state.fieldMeta)

const fieldType = computed(() => {
  if (props.type) return props.type
  if (props.meta?.type === "string") {
    if (props.meta.format === "email") return "email"
    return "string"
  }
  return props.meta?.type || "unknown"
})

props.register(computed(() => ({ name: props.field.name, label: props.label, id })))

// Get errors from form-level fieldMeta instead of field-level state
// This ensures errors persist when Field components re-mount due to :key changes
const _errors = computed(() => {
  const fieldMeta = formFieldMeta.value[props.field.name] as any
  return fieldMeta?.errors ?? []
})
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
    // Only convert to null/undefined if the field is actually nullable or optional
    if (props.meta?.nullableOrUndefined) {
      props.field.handleChange(
        props.meta.nullableOrUndefined === "undefined"
          ? undefined
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : null as any
      )
    } else {
      // Keep the actual value (e.g., empty string for S.String fields)
      props.field.handleChange(value)
    }
  } else {
    props.field.handleChange(value)
  }

  // whenever we change the field, regardless if we set it to null, we should reset onSubmit.
  // not sure why this is not the case in tanstack form.
  props.field.setMeta((m) => ({ ...m, errorMap: { ...m.errorMap, onSubmit: undefined } }))
}

// Note: Default value normalization (converting empty strings to null/undefined for nullable fields)
// is now handled at the form level in useOmegaForm, not here in the component

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
    max: props.meta?.type === "number"
      && (props.meta?.maximum
        ?? (typeof props.meta?.exclusiveMaximum === "number" && props.meta.exclusiveMaximum - 1)),
    min: props.meta?.type === "number"
      && (props.meta?.minimum
        ?? (typeof props.meta?.exclusiveMinimum === "number" && props.meta.exclusiveMinimum + 1)),
    errorMessages: errors.value,
    error: !!errors.value.length,
    type: fieldType.value,
    // Only add asterisk if label slot is not provided (slot has full control)
    label: slots.label ? props.label : `${props.label}${isRequired.value ? " *" : ""}`,
    options: props.options,
    inputClass: props.inputClass
  },

  state: props.state,
  field: wrapField(props.field)
}))
</script>
