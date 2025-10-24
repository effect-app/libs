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

console.log({ props })

watch(() => props.state, (value) => {
  if (value?._tag === null) {
    props.field.setValue(null)
  }
})
</script>
