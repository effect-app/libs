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
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
"
>
import { type DeepKeys, type DeepValue } from "@tanstack/vue-form"
import { watch } from "vue"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type useOmegaForm } from "./useOmegaForm"

const props = defineProps<{
  state: DeepValue<From, Name>
  field: OmegaFieldInternalApi<From, Name>
  name?: DeepKeys<From>
  form: ReturnType<typeof useOmegaForm<From, To>>
}>()

const values = props.form.useStore(({ values }) => values)

// Watch for _tag changes
watch(() => props.state, (newTag, oldTag) => {
  if (newTag === null) {
    props.field.setValue(null as DeepValue<From, Name>)
  }

  if (newTag !== oldTag) {
    props.form.reset(values.value)
    setTimeout(() => {
      props.field.validate("change")
    }, 0)
  }
}, { immediate: true })
</script>
