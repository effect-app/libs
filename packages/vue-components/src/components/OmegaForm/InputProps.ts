/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DeepValue,
  DeepKeys,
  FieldApi,
  ValidationError,
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  StandardSchemaV1,
  FieldValidateOrFn,
  FieldValidateFn,
  FieldValidateAsyncFn,
  FieldAsyncValidateOrFn,
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
  DeepValue<From, any>,
  FieldValidateOrFn<From, DeepKeys<From>,
  DeepValue<From, DeepKeys<From>>> | undefined,
  StandardSchemaV1<unknown, To> | FieldValidateFn<From, any, To>,
  StandardSchemaV1<unknown, To> | FieldValidateAsyncFn<From, any, To>,
  FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, any>>,
  FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, any>>,
  FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, any>> | undefined,
  FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, any>> | undefined,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  any,
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
