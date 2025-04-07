<template>
  <slot v-bind="inputProps">
    <div class="omega-input">
      <v-text-field
        v-if="fieldType === 'email' || fieldType === 'text'"
        :id="id"
        :required="inputProps.required"
        :min-length="inputProps.minLength"
        :max-length="inputProps.maxLength"
        :type="fieldType"
        :name="inputProps.name"
        :label="inputProps.label"
        :model-value="inputProps.modelValue"
        :error-messages="inputProps.errorMessages"
        :error="inputProps.error"
        v-bind="$attrs"
        @update:model-value="field.handleChange"
        @blur="setRealDirty"
      />
      <v-text-field
        v-if="fieldType === 'number'"
        :id="id"
        :required="inputProps.required"
        :min="inputProps.min"
        :max="inputProps.max"
        :type="fieldType"
        :name="inputProps.name"
        :label="inputProps.label"
        :model-value="inputProps.modelValue"
        :error-messages="inputProps.errorMessages"
        :error="inputProps.error"
        v-bind="$attrs"
        @update:model-value="
          (e: any) => {
            field.handleChange(Number(e))
          }
        "
        @blur="setRealDirty"
      />
      <div
        v-if="fieldType === 'select' || fieldType === 'multiple'"
        :class="fieldType !== 'multiple' && 'd-flex align-center'"
      >
        <v-select
          :id="id"
          :required="inputProps.required"
          :multiple="fieldType === 'multiple'"
          :chips="fieldType === 'multiple'"
          :name="inputProps.name"
          :model-value="inputProps.modelValue"
          :label="inputProps.label"
          :items="options"
          :error-messages="inputProps.errorMessages"
          :error="inputProps.error"
          v-bind="$attrs"
          @update:model-value="field.handleChange"
          @blur="setRealDirty"
        />
        <v-btn
          v-if="fieldType === 'select'"
          variant-btn="secondary"
          :variant-icon="mdiRefresh"
          class="mr-2"
          title="Reset"
          @click="field.handleChange(undefined)"
        >
          <v-icon :icon="mdiRefresh" />
        </v-btn>
      </div>

      <div
        v-if="
          fieldType === 'autocomplete' || fieldType === 'autocompletemultiple'
        "
        :class="fieldType !== 'autocompletemultiple' && 'd-flex align-center'"
      >
        <v-autocomplete
          :id="id"
          :multiple="fieldType === 'autocompletemultiple'"
          :required="inputProps.required"
          :name="inputProps.name"
          :model-value="inputProps.modelValue"
          :label="inputProps.label"
          :items="options"
          :error-messages="inputProps.errorMessages"
          :error="inputProps.error"
          :chips="fieldType === 'autocompletemultiple'"
          v-bind="$attrs"
          @update:model-value="field.handleChange"
          @blur="setRealDirty"
        />
        <v-btn
          v-if="fieldType === 'autocomplete'"
          variant-btn="secondary"
          :variant-icon="mdiRefresh"
          class="mr-2"
          title="Reset"
          @click="field.handleChange(undefined)"
        >
          <v-icon :icon="mdiRefresh" />
        </v-btn>
      </div>
    </div>
  </slot>
</template>

<script setup lang="ts" generic="To">
import { VTextField, VSelect } from "vuetify/components"
import { mdiRefresh } from "@mdi/js"
import { useStore } from "@tanstack/vue-form"
import {
  useAttrs,
  useId,
  computed,
  watch,
  onMounted,
  ref,
  watchEffect,
} from "vue"
import type {
  FieldValidators,
  MetaRecord,
  NestedKeyOf,
  TypeOverride,
} from "./OmegaFormStuff"
import { useOmegaErrors } from "./OmegaErrorsContext"
import type { FieldApiForAndrea } from "./InputProps"

const props = defineProps<{
  field: FieldApiForAndrea<To>
  meta: MetaRecord<To>[NestedKeyOf<To>]
  label: string
  options?: { title: string; value: string }[]
  type?: TypeOverride
  validators?: FieldValidators<To>
}>()

const id = useId()

const fieldApi = props.field

const fieldState = useStore(fieldApi.store, state => state)

const fieldType = computed(() => {
  if (props.type) return props.type
  if (props.meta?.type === "string") {
    if (props.meta.format === "email") return "email"
    return "text"
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

const inputProps = computed(() => ({
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
  ...useAttrs(),
}))
</script>

<style>
.omega-input {
  .v-input__details:has(.v-messages:empty) {
    grid-template-rows: 0fr;
    transition: all 0.2s;
  }

  & .v-messages:empty {
    min-height: 0;
  }

  & .v-input__details:has(.v-messages) {
    transition: all 0.2s;
    overflow: hidden;
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr;
  }

  & .v-messages {
    transition: all 0.2s;
    > * {
      transition-duration: 0s !important;
    }
  }

  v-btn {
    all: unset;
    cursor: pointer;
  }
}
</style>
