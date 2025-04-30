<template>
  <slot
    v-for="{ name, label, ...attrs } in children"
    :child="{ name, label, ...attrs }"
  >
    <OmegaInput :form="props.form" :name="name" :label="label" v-bind="attrs" />
  </slot>
</template>

<script setup lang="ts" generic="From, To">
import { computed } from "vue"
import {
  type NestedKeyOf,
  type MetaRecord,
  type FormType,
  type FieldMeta,
  type OmegaInputProps,
} from "./OmegaFormStuff"
import { pipe, Order, Array as A } from "effect-app"
import OmegaInput from "./OmegaInput.vue"

export type OmegaAutoGenMeta<From, To> = Omit<OmegaInputProps<From, To>, "form">
type NewMeta = OmegaAutoGenMeta<From, To>

const mapObject =
  <K extends string, A, B>(fn: (value: A, key: K) => B) =>
  (obj: Record<K, A>): Record<K, B> =>
    Object.fromEntries(
      (Object.entries(obj) as [K, A][]).map(([k, v]) => [k, fn(v, k)]),
    ) as Record<K, B> // Cast needed for Object.fromEntries

const filterRecord =
  <K extends string, V>(predicate: (value: V, key: K) => boolean) =>
  (obj: Record<K, V>): Record<K, V> =>
    Object.fromEntries(
      (Object.entries(obj) as [K, V][]).filter(([k, v]) => predicate(v, k)),
    ) as Record<K, V>

const filterMapRecord =
  <K extends string, A, B>(fn: (value: A, key: K) => false | B) =>
  (obj: Record<K, A>): Record<K, B> =>
    (Object.entries(obj) as [K, A][]).reduce(
      (acc, [key, value]) => {
        const result = fn(value, key)
        if (result !== false) {
          acc[key] = result
        }
        return acc
      },
      {} as Record<K, B>,
    )

const props = defineProps<{
  form: FormType<From, To> & {
    meta: MetaRecord<To>
  }
  pick?: NestedKeyOf<To>[]
  omit?: NestedKeyOf<To>[]
  labelMap?: (key: NestedKeyOf<To>) => string | undefined
  filterMap?: <M extends NewMeta>(key: NestedKeyOf<To>, meta: M) => boolean | M
  order?: NestedKeyOf<To>[]
  sort?: Order.Order<NewMeta>
}>()

const namePosition = (name: NestedKeyOf<To>, order: NestedKeyOf<To>[]) => {
  const index = order?.indexOf(name) ?? -1
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

const orderBy: Order.Order<NewMeta> = Order.mapInput(
  Order.number,
  (x: NewMeta) => namePosition(x.name, props.order || []),
)

const children = computed<NewMeta[]>(() =>
  pipe(
    props.form.meta as Record<NestedKeyOf<To>, FieldMeta | undefined>,
    // include / exclude
    filterRecord((_, metaKey) =>
      props.pick
        ? props.pick.includes(metaKey) && !props.omit?.includes(metaKey)
        : !props.omit?.includes(metaKey),
    ),
    x => x,
    // labelMap and adding name
    mapObject((metaValue, metaKey) => ({
      name: metaKey,
      label: props.labelMap?.(metaKey) || metaKey,
      ...metaValue,
    })),
    // filterMap
    props.filterMap
      ? filterMapRecord(m => {
          const result = props.filterMap?.(m.name!, m as NewMeta)
          return result === undefined || result === true ? m : result
        })
      : x => x,
    // transform to array
    obj => Object.values(obj) as NewMeta[],
    // order
    A.sort(orderBy),
    // sort
    props.sort ? A.sort(props.sort) : x => x,
  ),
)

defineSlots<{
  default(props: { child: NewMeta }): void
}>()
</script>
