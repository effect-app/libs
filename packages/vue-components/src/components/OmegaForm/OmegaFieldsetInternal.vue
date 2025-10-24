<template>
  <slot
    v-if="state?._tag"
    :name="state?._tag"
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
import { type DeepKeys } from "@tanstack/vue-form"
import { watch } from "vue"

const props = defineProps<{
  state: any
  field: any
}>()

// Watch for _tag changes
watch(() => props.state?._tag, (newTag, oldTag) => {
  if (newTag === null) {
    props.field.setValue(null)
  }
  if (newTag !== oldTag) {
    setTimeout(() => {
      props.field.validate("change")
    }, 0)
  }
})
</script>
