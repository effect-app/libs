<template>
  <component :is="form.Field" :name="name">
    <template #default="{ field }">
      <component
        :is="form.Field"
        v-for="(_, i) of field.state.value"
        :key="i"
        :name="
          `${name}[${String(i)}]` as DeepKeys<From>
        "
      >
        <template #default="{ field: subField, state: subState }">
          <slot
            v-bind="{
              field,
              subField,
              subState,
              index: i,
            }"
          />
        </template>
      </component>
      <slot name="field" v-bind="{ field }" />
    </template>
  </component>
</template>

<script setup lang="ts" generic="From, To">
import { computed, onMounted, provide } from "vue"
import {
  type CreateMeta,
  type OmegaInputProps,
  createMeta,
} from "./OmegaFormStuff"
import { type DeepValue, type DeepKeys } from "@tanstack/vue-form"

const props = defineProps<
  Omit<
    OmegaInputProps<From, To>,
    "validators" | "options" | "label" | "type" | "items"
  > & {
    items?: DeepValue<To, DeepKeys<To>>
  }
>()

defineOptions({
  inheritAttrs: false,
})

onMounted(() => {
  if (props.items) {
    props.form.setFieldValue(props.name as any, props.items)
  }
})

const getMetaFromArray = computed(() => {
  const inputMeta = props.form.meta[props.name]
  if (inputMeta && inputMeta.type === "multiple") {
    const result = inputMeta.rest.reduce<CreateMeta>((acc, curr) => {
      if (curr.type._tag === "TypeLiteral") {
        return {
          ...acc,
          propertySignatures: [
            ...(acc.propertySignatures || []),
            ...curr.type.propertySignatures,
          ],
        } as CreateMeta
      }
      return {
        ...acc,
        property: curr.type,
      } as CreateMeta
    }, {} as CreateMeta)

    const arrayMeta = createMeta({ ...result, meta: inputMeta })
    const getMeta = (index: string) => {
      if (index.endsWith("]")) return arrayMeta
      const parts = index.split("].")
      const key = parts[parts.length - 1]
      return arrayMeta[key as keyof typeof arrayMeta]
    }
    return getMeta
  }
  return (_: string) => undefined
})

provide("getMetaFromArray", getMetaFromArray)
</script>
