<template>
  <form
    novalidate
    @submit.prevent.stop="handleFormSubmit"
  >
    <fieldset :disabled="isFormLoading">
      <!-- Render externalForm + default slots if props.form is provided -->
      <template v-if="props.form">
        <slot
          name="externalForm"
          :subscribed-values="{ ...subscribedValues, isFormLoading }"
        />
        <slot />
        <!-- default slot -->
      </template>
      <!-- Render internalForm slot if form was created locally -->
      <slot
        v-else-if="localForm"
        name="internalForm"
        :form="localForm"
        :subscribed-values="{ ...subscribedValues, isFormLoading }"
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
  K extends keyof OmegaFormState<From, To> =
    keyof OmegaFormState<From, To>
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
import { type StandardSchemaV1Issue, useStore } from "@tanstack/vue-form"
import { type Record, type S } from "effect-app"
import { computed, getCurrentInstance, onBeforeMount, watch } from "vue"
import { getOmegaStore } from "./getOmegaStore"
import { provideOmegaErrors } from "./OmegaErrorsContext"
import { type FilterItems, type FormProps, type OmegaFormApi, type OmegaFormState, type ShowErrorsOn } from "./OmegaFormStuff"
import { type OmegaConfig, type OmegaFormReturn, useOmegaForm } from "./useOmegaForm"

type OmegaWrapperProps =
  & {
    omegaConfig?: OmegaConfig<From>
    subscribe?: (K | "isFormLoading")[]
    showErrorsOn?: ShowErrorsOn
  }
  & Omit<FormProps<From, To>, "onSubmit">
  & (
    | {
      form: OmegaFormReturn<From, To>
      schema?: undefined
    }
    | {
      form?: undefined
      schema: S.Schema<To, From, never>
    }
  )
  & (
    | {
      isLoading?: undefined
      onSubmit?: FormProps<From, To>["onSubmit"]
    }
    | {
      isLoading: boolean
      onSubmit: (data: To) => void
    }
  )

const props = withDefaults(defineProps<OmegaWrapperProps>(), {
  isLoading: undefined
})

const localForm = props.form || !props.schema
  ? undefined
  : useOmegaForm<From, To>(
    props.schema,
    {
      ...props,
      onSubmit: typeof props.isLoading !== "undefined"
        ? ({ value }) =>
          new Promise<void>((resolve) => {
            instance!.emit("submit", value)

            if (!props.isLoading) {
              // already finished, just resolve
              resolve()
              return
            }
            watch(() => props.isLoading, () => resolve(), { once: true })
          })
        : props.onSubmit
    },
    props.omegaConfig
  )

const formToUse = computed(() => props.form ?? localForm!)

onBeforeMount(() => {
  if (!props.form) return
  const formOptionsKeys = Object.keys(props.form.options || {})

  const excludedKeys: Set<keyof typeof props> = new Set([
    "omegaConfig",
    "subscribe",
    "showErrorsOn",
    "asyncAlways",
    "form",
    "schema"
  ])

  const filteredProps = Object.fromEntries(
    Object.entries(props).filter(
      ([key, value]) => {
        if (key === "isLoading") {
          return false
        }
        return !excludedKeys.has(key as keyof typeof props)
          && value !== undefined
      }
    )
  ) as Record<string, unknown>

  const propsKeys = Object.keys(filteredProps)

  const overlappingKeys = formOptionsKeys.filter(
    (key) =>
      propsKeys.includes(key)
      && filteredProps[key] !== undefined
  )

  if (overlappingKeys.length > 0) {
    console.warn(
      `[OmegaWrapper] Overlapping keys found between form options and filtered props:\n${
        overlappingKeys.join(
          ", \n"
        )
      }.\nProps will overwrite existing form options. This might indicate a configuration issue.`
    )
  }

  const mergedOptions = {
    ...formToUse.value.options,
    ...filteredProps
  }

  formToUse.value.options = Object.fromEntries(
    // TODO
    (Object.entries(mergedOptions) as any).filter(
      ([_, value]: any) => value !== undefined
    )
  )
})

const formIsSubmitting = useStore(
  formToUse.value.store,
  (state) => state.isSubmitting
)

const formIsValidating = useStore(
  formToUse.value.store,
  (state) => state.isFormValidating
)

const instance = getCurrentInstance()

const isFormLoading = computed(() =>
  props.isLoading || formIsSubmitting.value || formIsValidating.value
)

const handleFormSubmit = (): void => {
  if (isFormLoading.value) return

  formToUse.value.handleSubmit().then(() => {
    const formState = formToUse.value.store.state
    if (formState.isValid) {
      const values = formState.values
      instance?.emit("submit", values as unknown as To)
    }
  })
}

const subscribedValues = getOmegaStore(
  formToUse.value as unknown as OmegaFormApi<From, To>,
  props.subscribe?.filter((s) => s !== "isFormLoading") as K[]
)

const formSubmissionAttempts = useStore(
  formToUse.value.store,
  (state) => state.submissionAttempts
)

const errors = computed(() => formToUse.value.useStore((state) => state.errors))

watch(
  () => [formToUse.value.filterItems, errors.value.value],
  () => {
    const filterItems: FilterItems | undefined = formToUse.value.filterItems
    const currentErrors = errors.value.value
    if (!filterItems) return {}
    if (!currentErrors) return {}
    const errorList = Object
      .values(currentErrors)
      .filter(
        (fieldErrors): fieldErrors is Record<string, StandardSchemaV1Issue[]> =>
          Boolean(fieldErrors)
      )
      .flatMap((fieldErrors) =>
        Object
          .values(fieldErrors)
          .flat()
          .map((issue: StandardSchemaV1Issue) => issue.message)
      )

    if (errorList.some((e) => e === filterItems.message)) {
      // TODO: Investigate if filterItems.items should be typed based on DeepKeys<To>.
      filterItems.items.forEach((item: keyof From) => {
        const m = formToUse.value.getFieldMeta(item as any)
        if (m) {
          formToUse.value.setFieldMeta(item as any, {
            ...m,
            errorMap: {
              onSubmit: [
                { path: [item as string], message: filterItems.message }
              ]
            }
          })
        }
      })
    }
    return {}
  }
)

provideOmegaErrors(formSubmissionAttempts, errors.value, props.showErrorsOn)

defineSlots<{
  // Default slot (no props)
  default(): void
  // Named slot when form is created internally via schema
  internalForm(props: {
    form: OmegaFormReturn<From, To>
    subscribedValues: typeof subscribedValues.value & { isFormLoading: boolean }
  }): void
  // Named slot when form is passed via props (provides subscribedValues)
  externalForm(props: { subscribedValues: typeof subscribedValues.value }): void
}>()
</script>

<style scoped>
fieldset {
  display: contents;

  &[disabled] > * {
    pointer-events: none;
  }
}
</style>
