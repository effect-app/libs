<template>
  <form
    novalidate
    @submit.prevent.stop="formToUse.handleSubmit()"
  >
    <fieldset :disabled="formIsSubmitting">
      <!-- Render externalForm + default slots if props.form is provided -->
      <template v-if="props.form">
        <slot
          name="externalForm"
          :subscribed-values="subscribedValues"
        />
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
    subscribe?: K[]
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
      onSubmit?: undefined
      // TODO: we would need to rename everywhere.
      onSubmitAsync: FormProps<From, To>["onSubmit"]
    }
    | {
      onSubmitAsync?: undefined
      onSubmit: (
        data: To,
        resolve: (value: any) => void,
        reject: (value: any) => void
      ) => void
    }
  )

const props = defineProps<OmegaWrapperProps>()

const instance = getCurrentInstance()

// we prefer to use the standard abstraction in Vue which separates props (going down) and event emits (going back up)
// so if isLoading + @submit are provided, we wrap them into a Promise, so that TanStack Form can properly track the submitting state.
// we use this approach because it means we can keep relying on the built-in beaviour of TanStack Form, and we dont have to re-implement/keep in sync/break any internals.
const eventOnSubmit = (
  { value }: Parameters<NonNullable<FormProps<From, To>["onSubmit"]>>[0]
) =>
  new Promise<void>((resolve, reject) => {
    instance!.emit("submit", value, resolve, reject)
  })

const localForm = props.form || !props.schema
  ? undefined
  : useOmegaForm<From, To>(
    props.schema,
    {
      ...props,
      onSubmit: (submitProps) => {
        const onSubmitAsync = props.onSubmitAsync
        if (!onSubmitAsync) {
          return eventOnSubmit(submitProps)
        }
        return onSubmitAsync(submitProps)
      }
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

const subscribedValues = getOmegaStore(
  formToUse.value as unknown as OmegaFormApi<From, To>,
  props.subscribe
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
    subscribedValues: typeof subscribedValues.value
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
