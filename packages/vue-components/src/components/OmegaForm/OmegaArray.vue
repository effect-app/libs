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
        :name="`${name}[${Number(i)}]` as DeepKeys<From>"
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
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>
"
>
import { type DeepKeys, type DeepValue } from "@tanstack/vue-form"
import { computed, onMounted, provide } from "vue"
import { type OmegaInputProps } from "./OmegaFormStuff"

const props = defineProps<
  Omit<
    OmegaInputProps<From, To>,
    "validators" | "options" | "label" | "type" | "items"
  > & {
    defaultItems?: DeepValue<To, DeepKeys<To>>
    // deprecated items, caused bugs in state update, use defaultItems instead. It's not a simple Never, because Volar explodes
    items?: "please use `defaultItems` instead"
  }
>()

defineOptions({
  inheritAttrs: false
})

const store = props.form.useStore((state) => state.values)
const items = computed(() => {
  const normalizedPath = props.name.replace(/\[/g, ".").replace(/\]/g, "")
  try {
    return normalizedPath.split(".").reduce((acc, curr) => {
      return acc[curr] as typeof store.value
    }, store.value)
  } catch (e) {
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
