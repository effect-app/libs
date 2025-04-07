<template>
  <div class="omega-input">
    <v-text-field
      v-if="fieldType === 'email' || fieldType === 'string'"
      v-bind="$attrs"
      :id="id"
      :required="meta?.required"
      :min-length="meta?.type === 'string' && meta?.minLength"
      :max-length="meta?.type === 'string' && meta?.maxLength"
      :type="fieldType"
      :name="field.name"
      :label="`${label}${meta?.required ? ' *' : ''}`"
      :model-value="field.state.value"
      :error-messages="showedErrors"
      :error="!!showedErrors.length"
      @update:model-value="field.handleChange"
      @blur="setRealDirty"
    />
    <v-textarea
      v-if="fieldType === 'text'"
      v-bind="$attrs"
      :id="id"
      :required="meta?.required"
      :min-length="meta?.type === 'string' && meta?.minLength"
      :max-length="meta?.type === 'string' && meta?.maxLength"
      :type="fieldType"
      :name="field.name"
      :label="`${label}${meta?.required ? ' *' : ''}`"
      :model-value="field.state.value"
      :error-messages="showedErrors"
      :error="!!showedErrors.length"
      @update:model-value="field.handleChange"
      @blur="setRealDirty"
    />
    <v-text-field
      v-if="fieldType === 'number'"
      v-bind="$attrs"
      :id="id"
      :required="meta?.required"
      :min="meta?.type === 'number' && meta.minimum"
      :max="meta?.type === 'number' && meta.maximum"
      :type="fieldType"
      :name="field.name"
      :label="`${label}${meta?.required ? ' *' : ''}`"
      :model-value="field.state.value"
      :error-messages="showedErrors"
      :error="!!showedErrors.length"
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
        v-bind="$attrs"
        :id="id"
        :required="meta?.required"
        :multiple="fieldType === 'multiple'"
        :chips="fieldType === 'multiple'"
        :name="field.name"
        :model-value="field.state.value"
        :label="`${label}${meta?.required ? ' *' : ''}`"
        :items="options"
        :error-messages="showedErrors"
        :error="!!showedErrors.length"
        @update:model-value="field.handleChange"
        @blur="setRealDirty"
      />
      <v-btn
        v-if="fieldType !== 'multiple'"
        variant-btn="secondary"
        :variant-icon="mdiRefresh"
        class="mr-2"
        title="Reset"
        @click="field.handleChange(undefined)"
      ></v-btn>
    </div>
  </div>
</template>

<script setup lang="ts" generic="To">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { VTextField, VSelect } from "vuetify/components"
import { mdiRefresh } from "@mdi/js"
import { useStore, type FieldApi } from "@tanstack/vue-form"
import type {
  FieldValidators,
  MetaRecord,
  NestedKeyOf,
  TypeOverride,
} from "./OmegaFormStuff"
import { useOmegaErrors } from "./OmegaErrorsContext"
import { useId, computed, watch, onMounted, ref, watchEffect } from "vue"

const props = defineProps<{
  field: FieldApi<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
  meta: MetaRecord<To>[NestedKeyOf<To>]
  label: string
  options?: { title: string; value: string }[]
  type?: TypeOverride
  validators?: FieldValidators<To>
}>()

defineOptions({
  inheritAttrs: false,
})

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
  fieldState.value.meta.errors.map((e: any) => e.message).filter(Boolean),
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
          .map((e: any) => e.message)
          .filter(Boolean),
        label: props.label,
      })
    } else {
      removeError(id)
    }
  },
)
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
}
</style>
