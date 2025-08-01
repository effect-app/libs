<template>
  <form novalidate @submit.prevent.stop="formToUse.handleSubmit()">
    <fieldset :disabled="formIsSubmitting">
      <!-- Render externalForm + default slots if props.form is provided -->
      <template v-if="props.form">
        <slot name="externalForm" :subscribed-values="subscribedValues" />
        <slot />
        <!-- default slot -->
      </template>
      <!-- Render internalForm slot if form was created locally -->
      <slot
        v-else-if="localForm"
        name="internalForm"
        :form="localForm"
        :subscribed-values="subscribedValues"
      />
    </fieldset>
  </form>
</template>

<script
  setup
  lang="ts"
  generic="
    From extends Record<PropertyKey, any>,
    To extends Record<PropertyKey, any>,
    K extends keyof OmegaFormState<To, From> = keyof OmegaFormState<To, From>
  "
>
/**
 * Form component that wraps TanStack Form's useForm hook
 *
 * Usage:
 * <Form :default-values="..." :on-submit="..." :validators="..." ...etc>
 *   <template #default="{ form }">
 *     <!-- Children with access to form -->
 *     <component :is="form.Field" name="fieldName">
 *       <template #default="{ field }">
 *         <input
 *           :value="field.state.value"
 *           @input="e => field.handleChange(e.target.value)"
 *         />
 *       </template>
 *     </component>
 *   </template>
 * </Form>
 *
 * <Form :default-values="..." :on-submit="..." :validators="..." ...etc>
 *   <template #default="{ form }">
 *     <Input :form="form" name="foobar" />
 *   </template>
 * </Form>
 *
 * <Form :schema="schema" :subscribe="['values', 'isSubmitting']">
 *   <template #default="{ form, subscribedValues }">
 *     <Input :form="form" name="foobar" />
 *   </template>
 * </Form>
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStore, type StandardSchemaV1Issue } from "@tanstack/vue-form"
import { type S } from "effect-app"
import {
  type FormProps,
  type FilterItems,
  type OmegaFormApi,
  type OmegaFormState,
  type ShowErrorsOn,
} from "./OmegaFormStuff"
import { getOmegaStore } from "./getOmegaStore"
import { provideOmegaErrors } from "./OmegaErrorsContext"
import {
  type OmegaConfig,
  type OmegaFormReturn,
  useOmegaForm,
} from "./useOmegaForm"
import { computed, watch, onBeforeMount } from "vue"

const props = defineProps<
  {
    omegaConfig?: OmegaConfig<From>
    subscribe?: K[]
    showErrorsOn?: ShowErrorsOn
  } & FormProps<To, From> &
    (
      | {
          form: OmegaFormReturn<To, From>
          schema?: undefined
        }
      | {
          form?: undefined
          schema: S.Schema<From, To, never>
        }
    )
>()

const localForm = computed(() => {
  if (props.form || !props.schema) {
    return undefined
  }
  return useOmegaForm<From, To>(props.schema, props, props.omegaConfig)
})

const formToUse = computed(() => props.form ?? localForm.value!)

onBeforeMount(() => {
  if (!props.form) return
  const formOptionsKeys = Object.keys(props.form.options || {})

  const excludedKeys = new Set([
    "omegaConfig",
    "subscribe",
    "showErrorsOn",
    "asyncAlways",
    "form",
    "schema",
  ]) satisfies Set<keyof typeof props>
  type ExcludedKeys = typeof excludedKeys extends Set<infer U> ? U : never

  const filteredProps = Object.fromEntries(
    Object.entries(props).filter(
      ([key, value]) =>
        !excludedKeys.has(key as ExcludedKeys) && value !== undefined,
    ),
  ) as typeof props extends infer TOP
    ? {
        [K in keyof TOP as K extends ExcludedKeys ? never : K]: NonNullable<
          TOP[K]
        >
      }
    : never

  const propsKeys = Object.keys(filteredProps)

  const overlappingKeys = formOptionsKeys.filter(
    key =>
      propsKeys.includes(key) &&
      key in filteredProps &&
      filteredProps[key as keyof typeof filteredProps] !== undefined,
  )

  if (overlappingKeys.length > 0) {
    console.warn(
      `[OmegaWrapper] Overlapping keys found between form options and filtered props:\n${overlappingKeys.join(
        ", \n",
      )}.\nProps will overwrite existing form options. This might indicate a configuration issue.`,
    )
  }

  const mergedOptions = {
    ...formToUse.value.options,
    ...filteredProps,
  }

  formToUse.value.options = Object.fromEntries(
    // TODO
    Object.entries(mergedOptions).filter(([_, value]) => value !== undefined),
  )
})

const formIsSubmitting = useStore(
  formToUse.value.store,
  state => state.isSubmitting,
)

const subscribedValues = getOmegaStore(
  formToUse.value as OmegaFormApi<To, From>,
  props.subscribe,
)

const formSubmissionAttempts = useStore(
  formToUse.value.store,
  state => state.submissionAttempts,
)

const errors = computed(() => formToUse.value.useStore(state => state.errors))

watch(
  () => [formToUse.value.filterItems, errors.value.value],
  () => {
    const filterItems: FilterItems | undefined = formToUse.value.filterItems
    const currentErrors = errors.value.value
    if (!filterItems) return {}
    if (!currentErrors) return {}
    const errorList = Object.values(currentErrors)
      .filter(
        (fieldErrors): fieldErrors is Record<string, StandardSchemaV1Issue[]> =>
          Boolean(fieldErrors),
      )
      .flatMap(fieldErrors =>
        Object.values(fieldErrors)
          .flat()
          .map((issue: StandardSchemaV1Issue) => issue.message),
      )

    if (errorList.some(e => e === filterItems.message)) {
      // TODO: Investigate if filterItems.items should be typed based on DeepKeys<To>.
      filterItems.items.forEach((item: keyof From) => {
        const m = formToUse.value.getFieldMeta(item as any)
        if (m) {
          formToUse.value.setFieldMeta(item as any, {
            ...m,
            errorMap: {
              onSubmit: [
                { path: [item as string], message: filterItems.message },
              ],
            },
          })
        }
      })
    }
    return {}
  },
)

provideOmegaErrors(formSubmissionAttempts, errors.value, props.showErrorsOn)

defineSlots<{
  // Default slot (no props)
  default(): void
  // Named slot when form is created internally via schema
  internalForm(props: {
    form: OmegaFormReturn<To, From>
    subscribedValues: typeof subscribedValues.value
  }): void
  // Named slot when form is passed via props (provides subscribedValues)
  externalForm(props: { subscribedValues: typeof subscribedValues.value }): void
}>()
</script>

<style scoped>
fieldset {
  display: contents;
}
</style>
