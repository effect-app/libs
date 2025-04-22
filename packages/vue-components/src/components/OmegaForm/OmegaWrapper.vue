<template>
  <form novalidate @submit.prevent.stop="form.handleSubmit()">
    <fieldset :disabled="formIsSubmitting">
      <slot :form="form" :subscribed-values="subscribedValues" />
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
  type FilterItems,
  type FormProps,
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
import { watch } from "vue"

const props = defineProps<
  {
    omegaConfig?: OmegaConfig<From>
    subscribe?: K[]
    showErrorsOn?: ShowErrorsOn
  } & (
    | {
        form: OmegaFormReturn<To, From>
        schema?: undefined
      }
    | (FormProps<To, From> & {
        form?: undefined
        schema: S.Schema<From, To, never>
      })
  )
>()

const form: Omit<OmegaFormReturn<To, From>, "Input"> = props.form ??
useOmegaForm<From, To>(props.schema, props, props.omegaConfig)

const formIsSubmitting = useStore(form.store, state => state.isSubmitting)

const subscribedValues = getOmegaStore(
  form as OmegaFormApi<To, From>,
  props.subscribe,
)

const formSubmissionAttempts = useStore(
  form.store,
  state => state.submissionAttempts,
)

const errors = form.useStore(state => state.errors)

watch(
  () => [form.filterItems, errors.value],
  () => {
    const filterItems: FilterItems | undefined = form.filterItems
    if (!filterItems) return {}
    if (!errors.value) return {}
    const errorList = Object.values(errors.value)
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
      filterItems.items.forEach((item: any) => {
        const m: any = form.getFieldMeta(item)
        form.setFieldMeta(item, {
          ...m,
          errorMap: {
            onSubmit: [{ path: [item], message: filterItems.message }],
          },
        })
      })
    }
    return {}
  },
)

provideOmegaErrors(formSubmissionAttempts, errors, props.showErrorsOn)
</script>

<style scoped>
fieldset {
  display: contents;
}
</style>
