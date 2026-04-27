<template>
  <slot
    v-for="({ name, label, ...attrs }) in children"
    :child="{ name, label, ...attrs }"
  >
    <form.Input
      :name="name as FieldPath<From>"
      :label="label"
      v-bind="attrs"
    />
  </slot>
</template>

<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, string>,
  To extends Record<PropertyKey, string>,
  Name extends DeepKeys<From>
"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { Order } from "effect-app"
import { computed } from "vue"
import { type FieldMeta, type FieldPath, type OmegaAutoGenMeta, type OmegaInputProps } from "./OmegaFormStuff"

type NewMeta = OmegaAutoGenMeta<From, To, Name>

const mapObject = <K extends string, A, B>(fn: (value: A, key: K) => B) => (obj: Record<K, A>): Record<K, B> =>
  Object.fromEntries(
    (Object.entries(obj) as [K, A][]).map(([k, v]) => [k, fn(v, k)])
  ) as Record<K, B> // Cast needed for Object.fromEntries

const filterRecord =
  <K extends string, V>(predicate: (value: V, key: K) => boolean) => (obj: Record<K, V>): Record<K, V> =>
    Object.fromEntries(
      (Object.entries(obj) as [K, V][]).filter(([k, v]) => predicate(v, k))
    ) as Record<K, V>

const filterMapRecord =
  <K extends string, A, B>(fn: (value: A, key: K) => false | B) => (obj: Record<K, A>): Record<K, B> =>
    (Object.entries(obj) as [K, A][]).reduce(
      (acc, [key, value]) => {
        const result = fn(value, key)
        if (result !== false) {
          acc[key] = result
        }
        return acc
      },
      {} as Record<K, B>
    )

const props = defineProps<{
  form: OmegaInputProps<From, To, Name>["form"]
  pick?: DeepKeys<From>[]
  omit?: DeepKeys<From>[]
  labelMap?: (key: DeepKeys<From>) => string | undefined
  filterMap?: <M extends NewMeta>(key: DeepKeys<From>, meta: M) => boolean | M
  order?: DeepKeys<From>[]
  sort?: Order.Order<NewMeta>
}>()

const namePosition = (name: DeepKeys<From>, order: DeepKeys<From>[]) => {
  const index = order?.indexOf(name) ?? -1
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

const orderBy: Order.Order<NewMeta> = Order.mapInput(
  Order.Number,
  (x: NewMeta) => namePosition(x.name, props.order || [])
)

const children = computed<NewMeta[]>(() => {
  const included = filterRecord((value, metaKey) =>
    Boolean(value)
    && (
      props.pick
        ? props.pick.includes(metaKey) && !props.omit?.includes(metaKey)
        : !props.omit?.includes(metaKey)
    )
  )(props.form.meta as Record<DeepKeys<From>, FieldMeta | undefined>) as Record<DeepKeys<From>, FieldMeta>

  const withLabels = mapObject((metaValue: FieldMeta, metaKey) => ({
    name: metaKey,
    label: props.labelMap?.(metaKey) || metaKey,
    ...metaValue
  }))(included) as unknown as Record<DeepKeys<From>, NewMeta>

  const filtered = props.filterMap
    ? filterMapRecord((m: NewMeta) => {
      const result = props.filterMap?.(m.name, m)
      return result === undefined || result === true ? m : result
    })(withLabels) as Record<DeepKeys<From>, NewMeta>
    : withLabels

  const sorted = [...Object.values(filtered) as NewMeta[]].sort(orderBy)

  return props.sort ? sorted.sort(props.sort) : sorted
})

defineSlots<{
  default(props: { child: NewMeta }): void
}>()
</script>
