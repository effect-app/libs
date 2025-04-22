<template>
  <div>autogeneration</div>
</template>

<script setup lang="ts" generic="From, To">
import { computed, watchEffect } from "vue"
import { type NestedKeyOf, type MetaRecord } from "./OmegaFormStuff"
import { pipe, Array, Option } from "effect"

const props = defineProps<{
  meta: MetaRecord<To>
  include?: NestedKeyOf<To>[]
  exclude?: NestedKeyOf<To>[]
  labelMap?: (
    key: NestedKeyOf<To>,
  ) => MetaRecord<To>[NestedKeyOf<To> & { label: string }]
  filterMap?: (
    key: NestedKeyOf<To>,
  ) => boolean | MetaRecord<To>[NestedKeyOf<To>]
}>()

const children = computed(() => {
  const keys = pipe(
    Object.keys(props.meta) as NestedKeyOf<To>[],
    Array.filter(key => (props.include ? props.include.includes(key) : true)),
    Array.filter(key => !props.exclude?.includes(key)),
  )
  const result = pipe(
    keys,
    Array.filterMap(key => {
      if (typeof props.filterMap === "function") {
        const result = props.filterMap(key)
        if (result === false) return Option.none()
        if (result === true) return Option.some(props.meta[key])
        return Option.some(result)
      }
      return Option.some(props.meta[key])
    }),
  )
  return result
})

watchEffect(() => {
  console.log({ children: children.value })
})
</script>
