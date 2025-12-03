<script
  setup
  lang="ts"
  generic="From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From> | undefined = DeepKeys<From>"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { computed, provide, ref, watch } from "vue"
import { type TaggedUnionOption } from "./InputProps"
import { type FieldPath } from "./OmegaFormStuff"
import OmegaTaggedUnionInternal from "./OmegaTaggedUnionInternal.vue"
import { type useOmegaForm } from "./useOmegaForm"

defineProps<{
  name?: Name
  form: ReturnType<typeof useOmegaForm<From, To>>
  type?: "select" | "radio"
  options: TaggedUnionOption<From, Name>[]
  label?: string
}>()

// Track the current tag value reactively
const currentTag = ref<string | null>(null)

// Watch the form's _tag field value
const tagPath = computed(() => props.name ? `${props.name}._tag` : "_tag")
const formValues = props.form.useStore((state) => state.values)
watch(
  () => {
    const path = tagPath.value
    // Navigate to the nested value
    return path.split(".").reduce((acc: any, key) => acc?.[key], formValues.value) as string | null
  },
  (newTag) => {
    currentTag.value = newTag ?? null
  },
  { immediate: true }
)

// Provide tag-specific metadata to all child Input components
const getMetaFromArray = computed(() => {
  const tag = currentTag.value

  const getMeta = (path: string) => {
    if (!tag) return null

    // Get the tag-specific metadata
    const tagMeta = props.form.unionMeta[tag]
    if (!tagMeta) {
      return null
    }

    // Look up the meta for this path
    const result = tagMeta[path as keyof typeof tagMeta] ?? null
    return result
  }

  return getMeta
})

provide("getMetaFromArray", getMetaFromArray)
</script>

<template>
  <form.Field :name="name ? `${name}._tag` : '_tag'">
    <template #default="inputProps">
      <slot
        name="OmegaCustomInput"
        v-bind="inputProps"
      >
        <form.Input
          :name="(name ? `${name}._tag` : '_tag') as FieldPath<From>"
          :label="label"
          :type="type ?? 'select'"
          :options="options"
        />
      </slot>
      <slot />
      <OmegaTaggedUnionInternal
        :field="inputProps.field as any"
        :state="inputProps.state.value"
        :name="name"
        :form="form"
      >
        <template
          v-for="(_, slotname) in $slots"
          #[slotname]="slotProps"
        >
          <slot
            :name="slotname"
            v-bind="slotProps"
          />
        </template>
      </OmegaTaggedUnionInternal>
      <slot
        v-if="inputProps.state.value"
        name="OmegaCommon"
      />
    </template>
  </form.Field>
</template>
