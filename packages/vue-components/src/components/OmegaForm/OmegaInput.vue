<template>
  <component
    :is="form.Field"
    :name="name"
    :validators="{
      onChange: schema,
      ...validators,
    }"
  >
    <template #default="{ field }">
      <OmegaInternalInput
        v-if="meta"
        :field="field"
        :label="label"
        :options="options"
        :meta="meta"
        :type="type"
        v-bind="$attrs"
      >
        <template #default="inputProps">
          <slot v-bind="inputProps" />
        </template>
      </OmegaInternalInput>
    </template>
  </component>
</template>

<script setup lang="ts" generic="From, To">
import { computed, inject, type Ref } from "vue"
import {
  type FieldMeta,
  generateInputStandardSchemaFromFieldMeta,
  type OmegaInputProps,
} from "./OmegaFormStuff"
import OmegaInternalInput from "./OmegaInternalInput.vue"
import type { OmegaFieldInternalApi } from "./InputProps"

const props = defineProps<OmegaInputProps<From, To>>()

defineOptions({
  inheritAttrs: false,
})

const getMetaFromArray = inject<Ref<(name: string) => FieldMeta | null> | null>(
  "getMetaFromArray",
  null,
)

const meta = computed(() => {
  if (getMetaFromArray?.value && getMetaFromArray.value(props.name)) {
    return getMetaFromArray.value(props.name)
  }
  return props.form.meta[props.name]
})

const schema = computed(() => {
  if (!meta.value) {
    throw new Error("Meta is undefined")
  }
  return generateInputStandardSchemaFromFieldMeta(meta.value)
})
</script>
