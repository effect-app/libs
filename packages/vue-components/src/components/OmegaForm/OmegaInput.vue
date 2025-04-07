<template>
  <component
    :is="form.Field"
    :name="name"
    :validators="{
      onChange: schema,
      ...validators,
    }"
  >
    <template #default="{ field }: { field: FieldApiForAndrea<To> }">
      <OmegaInternalInput
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
import { computed } from "vue"
import {
  generateInputStandardSchemaFromFieldMeta,
  type FieldValidators,
  type FormType,
  type MetaRecord,
  type NestedKeyOf,
  type TypeOverride,
} from "./OmegaFormStuff"
import OmegaInternalInput from "./OmegaInternalInput.vue"
import type { FieldApiForAndrea } from "./InputProps"

const props = defineProps<{
  form: FormType<From, To> & {
    meta: MetaRecord<To>
  }
  name: NestedKeyOf<To>
  validators?: FieldValidators<From>
  label: string
  options?: { title: string; value: string }[]
  type?: TypeOverride
}>()

defineOptions({
  inheritAttrs: false,
})

const meta = computed(() => {
  return props.form.meta[props.name]
})

const schema = computed(() => {
  if (!meta.value) {
    throw new Error("Meta is undefined")
  }
  return generateInputStandardSchemaFromFieldMeta(meta.value)
})
</script>
