import type { StandardSchemaV1Issue } from "@tanstack/vue-form"
import { computed, inject, type InjectionKey, readonly, type Ref, ref } from "vue"
import { type OmegaError, type ShowErrorsOn } from "./OmegaFormStuff"

export const OmegaErrorsKey = Symbol() as InjectionKey<{
  errors: Ref<readonly OmegaError[]>
  addError: (error: OmegaError) => void
  removeError: (inputId: string) => void
  clearErrors: () => void
  showErrors: Ref<boolean>
  showErrorsOn: ShowErrorsOn
  generalErrors: Readonly<
    Ref<
      (Record<string, StandardSchemaV1Issue[]> | undefined)[] | undefined
    >
  >
}>

export function buildOmegaErrors(
  formSubmissionAttempts: Ref<number>,
  generalErrors: Readonly<
    Ref<
      (Record<string, StandardSchemaV1Issue[]> | undefined)[] | undefined
    >
  >,
  showErrorsOn: ShowErrorsOn = "onSubmit"
) {
  const errors = ref<OmegaError[]>([])

  const removeError = (inputId: string) => {
    errors.value = errors.value.filter((error) => error.inputId !== inputId)
  }

  const addError = (error: OmegaError) => {
    removeError(error.inputId)
    errors.value.push(error)
  }

  const clearErrors = () => {
    errors.value = []
  }

  const showErrors = computed(() => {
    if (showErrorsOn === "onSubmit") return formSubmissionAttempts.value > 0
    return true
  })

  const context = {
    errors: readonly(errors),
    addError,
    removeError,
    clearErrors,
    showErrors,
    generalErrors,
    showErrorsOn: showErrorsOn ?? "onSubmit"
  }

  return context
}

export function useOmegaErrors() {
  const context = inject(OmegaErrorsKey)
  if (!context) {
    throw new Error("useOmegaErrors must be used within an OmegaForm provider")
  }
  return context
}
