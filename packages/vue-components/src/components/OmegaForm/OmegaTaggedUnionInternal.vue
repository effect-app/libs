<template>
  <slot
    v-if="state?._tag"
    :name="`${name ? `${name}.` : ''}${state?._tag}`"
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

const props = defineProps<{
  state: DeepValue<From, Name>
  field: OmegaFieldInternalApi<From, Name>
  name?: DeepKeys<From>
}>()

// Watch for _tag changes
watch(() => props.state?._tag, (newTag, oldTag) => {
  if (newTag === null) {
    props.field.setValue(null as DeepValue<From, Name>)
  }
  if (newTag !== oldTag) {
    setTimeout(() => {
      props.field.validate("change")
    }, 0)
  }
})
</script>
