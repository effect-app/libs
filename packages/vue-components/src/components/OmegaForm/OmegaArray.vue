<template>
  <component :is="form.Field" :name="name">
    <template #default="{ field }">
      <component
        :is="form.Field"
        v-for="(_, i) of field.state.value"
        :key="i"
        :name="`${name}[${i}]`"
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
import { computed, provide } from "vue"
import { type OmegaInputProps, createMeta } from "./OmegaFormStuff"
import { type S } from "effect-app"

const props =
  defineProps<
    Omit<OmegaInputProps<From, To>, "validators" | "options" | "label" | "type">
  >()

defineOptions({
  inheritAttrs: false,
})

const getMetaFromArray = computed(() => {
  const inputMeta = props.form.meta[props.name]
  if (inputMeta && inputMeta.type === "multiple") {
    const propertySignatures = inputMeta.rest.reduce(
      (acc, curr) => {
        if (curr.type._tag === "TypeLiteral") {
          acc.propertySignatures.push(...curr.type.propertySignatures)
        }
        return acc
      },
      {
        propertySignatures: [],
      } as { propertySignatures: S.AST.PropertySignature[] },
    )

    const arrayMeta = createMeta(propertySignatures)
    const getMeta = (index: string) => {
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
