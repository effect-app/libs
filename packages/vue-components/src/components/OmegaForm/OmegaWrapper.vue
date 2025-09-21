<template>
  <form
    novalidate
    @submit.prevent.stop="form.handleSubmit()"
  >
    <fieldset :disabled="formIsSubmitting || disabled">
      <slot :subscribed-values="subscribedValues" />
    </fieldset>
  </form>
</template>

<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  K extends keyof OmegaFormState<From, To> = keyof OmegaFormState<From, To>,
  Props = DefaultInputProps<From>
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
import { useStore } from "@tanstack/vue-form"
import { type Record } from "effect-app"
import { onBeforeMount } from "vue"
import { getOmegaStore } from "./getOmegaStore"
import { type OmegaFormApi, type OmegaFormState } from "./OmegaFormStuff"
import { type DefaultInputProps, type OmegaFormReturn } from "./useOmegaForm"

type OmegaWrapperProps = {
  form: OmegaFormReturn<From, To, Props>
  disabled?: boolean
  // omegaConfig?: OmegaConfig<From>
  subscribe?: K[]
}
// & Omit<FormProps<From, To>, "onSubmit">

const props = defineProps<OmegaWrapperProps>()

onBeforeMount(() => {
  if (!props.form) return
  const formOptionsKeys = Object.keys(props.form.options || {})

  const excludedKeys: Set<keyof typeof props> = new Set([
    // "omegaConfig",
    "subscribe",
    //    "asyncAlways",
    "form"
    // "canSubmitWhenInvalid"
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
    ...props.form.options,
    ...filteredProps
  }
  // if (onSubmitHandler) mergedOptions.onSubmit = onSubmitHandler

  // props.form.options = Object.fromEntries(
  //   // TODO
  //   (Object.entries(mergedOptions) as any).filter(
  //     ([_, value]: any) => value !== undefined
  //   )
  // )
})

const formIsSubmitting = useStore(
  props.form.store,
  (state) => state.isSubmitting
)

const subscribedValues = getOmegaStore(
  props.form as unknown as OmegaFormApi<From, To>,
  props.subscribe
)

defineSlots<{
  default(props: { subscribedValues: typeof subscribedValues.value }): void
}>()

// provide(OmegaFormKey, props.form)
</script>

<style scoped>
fieldset {
  display: contents;

  &[disabled] > * {
    pointer-events: none;
  }
}
</style>
