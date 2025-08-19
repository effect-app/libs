/* eslint-disable @typescript-eslint/no-explicit-any */
import type { 
  DeepValue, 
  DeepKeys,
  FieldApi,
  ValidationError
} from "@tanstack/vue-form"
import { OmegaFormApi, type NestedKeyOf } from "./OmegaFormStuff"

export type FieldState<TValue = any> = {
  value: TValue
  meta: {
    errors: ValidationError[]
  }
}

// Desculpame madre
export type OmegaFieldInternalApi<From, To> = FieldApi<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any> & {
  store: {
    state: FieldState<DeepValue<From, DeepKeys<From>>>
  }
}

export type InputProps<T = unknown, S = unknown> = {
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
