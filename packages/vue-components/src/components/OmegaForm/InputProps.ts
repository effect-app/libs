/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DeepValue,
  DeepKeys,
  FieldApi,
  ValidationError,
  FieldComponent,
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  StandardSchemaV1,
  FieldValidateOrFn,
} from "@tanstack/vue-form"

export type FieldState<TValue = any> = {
  value: TValue
  meta: {
    errors: ValidationError[]
  }
}

export type OmegaFieldInternalApi<From, To> = FieldApi<
  From,
  DeepKeys<From>,
  DeepValue<From, DeepKeys<From>>,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  | FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
  | undefined,
  StandardSchemaV1<From, To>,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined
>

export type InputProps<T, S = unknown> = {
  id: string
  required?: boolean
  minLength?: number | false
  maxLength?: number | false
  max?: number | false
  min?: number | false
  name: string
  modelValue: S
  errorMessages: string[]
  error: boolean
  field: OmegaFieldInternalApi<T, S>
  setRealDirty: () => void
  type: string
  label: string
  options?: { title: string; value: string }[]
}
