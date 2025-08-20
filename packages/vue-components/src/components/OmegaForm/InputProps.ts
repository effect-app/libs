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

export type OmegaFieldInternalApi<From, To> = FieldApi<
  From,
  DeepKeys<From>,
  DeepValue<From, any>,
  FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, any>> | undefined,
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

export type InputProps<From, To> = {
  id: string
  required?: boolean
  minLength?: number | false
  maxLength?: number | false
  max?: number | false
  min?: number | false
  name: string
  modelValue: From
  errorMessages: string[]
  error: boolean
  field: OmegaFieldInternalApi<From, To>
  setRealDirty: () => void
  type: string
  label: string
  options?: { title: string; value: string }[]
}
