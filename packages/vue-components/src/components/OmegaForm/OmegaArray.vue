<template>
  <component
    :is="form.Field"
    :name="name"
  >
    <template #default="{ field, state }">
      <slot
        name="pre-array"
        v-bind="{ field, state }"
      />
      <component
        :is="form.Field"
        v-for="(_, i) of items"
        :key="`${name}[${Number(i)}]`"
        :name="// eslint-disable-next-line
          `${name}[${Number(i)}]` as DeepKeys<From>
        "
      >
        <template #default="{ field: subField, state: subState }">
          <slot
            v-bind="{
              subField,
              subState,
              index: Number(i),
              field
            }"
          />
        </template>
      </component>
      <slot
        name="post-array"
        v-bind="{ field, state }"
      />
      <!-- TODO: legacy slot, remove this slot -->
      <slot
        name="field"
        v-bind="{ field }"
      />
    </template>
  </component>
</template>
<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>, To extends Record<PropertyKey, any>, Name extends DeepKeys<From>"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { computed, onMounted, provide } from "vue"
import { type OmegaArrayProps } from "./OmegaFormStuff"

const props = defineProps<OmegaArrayProps<From, To, Name>>()

defineOptions({
  inheritAttrs: false
})

const store = props.form.useStore((state) => state.values)
const items = computed(() => {
  const normalizedPath = props.name.replace(/\[/g, ".").replace(/\]/g, "")
  try {
    return normalizedPath.split(".").reduce((acc, curr) => {
      // if the one of the node is undefined or null, all their branches and leaves need to be set as undefined or null
      if (!acc) return acc
      return acc[curr] as typeof store.value
    }, store.value)
  } catch (e) {
    console.error(e)
    return []
  }
})

onMounted(async () => {
  if (props.defaultItems && !items.value) {
    props.form.setFieldValue(props.name, props.defaultItems)
  }
})

const getMetaFromArray = computed(() => {
  const getMeta = (path: string) => {
    // Transform path like 'a[0].b[11].c' into 'a.b.c'
    const simplifiedPath = path.replace(/\[\d+\]/g, "")

    return props.form.meta[simplifiedPath as keyof typeof props.form.meta]
  }

  return getMeta
})

provide("getMetaFromArray", getMetaFromArray)
</script>
