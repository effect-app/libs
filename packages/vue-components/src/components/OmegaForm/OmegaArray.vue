<template>
  <form.Field
    v-for="(_, i) of items"
    :key="`${name}[${Number(i)}]`"
    :name="
      `${name}[${Number(i)}]` as DeepKeys<From>
    "
  >
    <template #default="{ field: subField, state: subState }">
      <slot
        v-bind="{
          subField,
          subState,
          index: Number(i),
        }"
      />
    </template>
  </form.Field>
</template>

<script
  setup
  lang="ts"
  generic="
    From extends Record<PropertyKey, any>,
    To extends Record<PropertyKey, any>
  "
>
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
    defaultItems?: DeepValue<To, DeepKeys<To>>
    // deprecated items, caused bugs in state update, use defaultItems instead. It's not a simple Never, because Volar explodes
    items?: "please use `defaultItems` instead"
  }
>()

defineOptions({
  inheritAttrs: false,
})

const store = props.form.useStore(state => state.values)
const items = computed(() => {
  return props.name.split(".").reduce((acc, curr) => {
    if (curr === "items") {
      return acc[curr]
    }
    return acc[curr] as typeof store.value
  }, store.value)
})

onMounted(async () => {
  if (props.defaultItems && !items.value) {
    props.form.setFieldValue(props.name, props.defaultItems)
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
