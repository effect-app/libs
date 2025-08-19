/* eslint-disable @typescript-eslint/no-explicit-any */
import type { 
  FieldApi, 
  DeepValue, 
  ValidationError,
  FieldValidateOrFn,
  FieldAsyncValidateOrFn,
  FormValidateOrFn,
  FormAsyncValidateOrFn,
  StandardSchemaV1,
  DeepKeys
} from "@tanstack/vue-form"
import { OmegaFormApi, type NestedKeyOf } from "./OmegaFormStuff"

// Define a more flexible Updater type that can accept direct values
type FlexibleUpdater<T> = ((prev: T) => T) | T

export type OmegaFieldInternalApi<From, To> = {
  state: {
    value: DeepValue<From, NestedKeyOf<From>>
    meta: {
      errors: ValidationError[]
    }
  }
  store: any
  handleChange: (
    updater: FlexibleUpdater<DeepValue<From, NestedKeyOf<From>>>,
  ) => void
  setValue: (
    updater: FlexibleUpdater<DeepValue<From, NestedKeyOf<From>>>,
  ) => void
  handleBlur: () => void
}

export type InputProps<T, S> = {
  id: string
  required?: boolean
  minLength?: number | false
  maxLength?: number | false
  max?: number | false
  min?: number | false
  name: string
  modelValue: unknown
  errorMessages: string[]
  error: boolean
  field: OmegaFieldInternalApi<T, S>
  setRealDirty: () => void
  type: string
  label: string
  options?: { title: string; value: string }[]
}
