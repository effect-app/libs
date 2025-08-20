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

export type OmegaFieldInternalApi<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = FieldApi<
  From,
  TName,
  DeepValue<From, TName>,
  FieldValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  StandardSchemaV1<DeepValue<From, TName>, unknown> | FieldValidateFn<From, TName>,
  StandardSchemaV1<DeepValue<From, TName>, unknown> | FieldValidateAsyncFn<From, TName>,
  FieldValidateOrFn<From, TName, DeepValue<From, TName>>,
  FieldAsyncValidateOrFn<From, TName, DeepValue<From, TName>>,
  FieldValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  FieldAsyncValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  any, // TODO
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined
>

export type InputProps<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = {
  id: string
  required?: boolean
  minLength?: number | false
  maxLength?: number | false
  max?: number | false
  min?: number | false
  name: string
  modelValue: DeepValue<From, TName>
  errorMessages: string[]
  error: boolean
  field: OmegaFieldInternalApi<From, TName>
  setRealDirty: () => void
  type: string
  label: string
  options?: { title: string; value: string }[]
}
