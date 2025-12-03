<template>
  <slot
    v-if="state"
    :name="`${name ? `${name}.` : ''}${state}`"
    v-bind="{ field, state }"
  />
</template>

<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, To extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys, type DeepValue } from "@tanstack/vue-form"
import { nextTick, watch } from "vue"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type useOmegaForm } from "./useOmegaForm"

const props = defineProps<{
  state: DeepValue<From, Name>
  field: OmegaFieldInternalApi<From, Name>
  name?: DeepKeys<From>
  form: ReturnType<typeof useOmegaForm<From, To>>
}>()

// Watch for _tag changes
watch(() => props.state, (newTag, oldTag) => {
  if (newTag === null) {
    props.field.setValue(null as DeepValue<From, Name>)
  }

  if (newTag !== oldTag && newTag) {
    // Use nextTick to avoid cleanup conflicts during reactive updates
    nextTick(() => {
      // Get default values for the new tag to ensure correct types
      const tagDefaults = (props.form as any).unionDefaultValues?.[newTag as string] ?? {}
      // Merge: keep _tag from current values, but use tag defaults for other fields
      const resetValues = {
        ...tagDefaults,
        _tag: newTag
      }
      props.form.reset(resetValues as any)
      setTimeout(() => {
        props.field.validate("change")
      }, 0)
    })
  }
}, { immediate: true })
</script>
