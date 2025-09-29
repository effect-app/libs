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
  generic="From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  K extends keyof OmegaFormState<From, To> = keyof OmegaFormState<From, To>,
  Props = DefaultInputProps<From>"
>
/**
 * Form component that wraps TanStack Form's useForm hook
 *
 * Usage:
 * <form.Form>
 *   <form.Input name="foobar" />
 *   <form.Errors />
 * </form.Form>
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStore } from "@tanstack/vue-form"
import { getOmegaStore } from "./getOmegaStore"
import { type DefaultInputProps, type OmegaFormApi, type OmegaFormState } from "./OmegaFormStuff"
import { type OmegaFormReturn } from "./useOmegaForm"

type OmegaWrapperProps = {
  form: OmegaFormReturn<From, To, Props>
  disabled?: boolean
  subscribe?: K[]
}

const props = defineProps<OmegaWrapperProps>()

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
</script>

<style scoped>
fieldset {
  display: contents;

  &[disabled] > * {
    pointer-events: none;
  }
}
</style>
