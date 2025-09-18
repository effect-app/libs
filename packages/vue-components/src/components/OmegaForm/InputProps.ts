/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DeepKeys, DeepValue, FieldApi, FieldAsyncValidateOrFn, FieldValidateAsyncFn, FieldValidateFn, FieldValidateOrFn, FormAsyncValidateOrFn, FormValidateOrFn, StandardSchemaV1 } from "@tanstack/vue-form"

export type OmegaFieldInternalApi<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = FieldApi<
  /* in out TParentData*/ From,
  /* in out TName*/ TName,
  /* in out TData*/ DeepValue<From, TName>,
  /* in out TOnMount*/ FieldValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  /* in out TOnChange*/ StandardSchemaV1<DeepValue<From, TName>, unknown> | FieldValidateFn<From, TName>,
  /* in out TOnChangeAsync*/ StandardSchemaV1<DeepValue<From, TName>, unknown> | FieldValidateAsyncFn<From, TName>,
  /* in out TOnBlur*/ FieldValidateOrFn<From, TName, DeepValue<From, TName>>,
  /* in out TOnBlurAsync*/ FieldAsyncValidateOrFn<From, TName, DeepValue<From, TName>>,
  /* in out TOnSubmit*/ FieldValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  /* in out TOnSubmitAsync*/ FieldAsyncValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  /* in out TOnDynamic*/ FieldValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  /* in out TOnDynamicAsync*/ FieldAsyncValidateOrFn<From, TName, DeepValue<From, TName>> | undefined,
  /* in out TFormOnMount*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnChange*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnChangeAsync*/ any,
  /* in out TFormOnBlur*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnBlurAsync*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TFormOnSubmit*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnSubmitAsync*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TFormOnDynamic*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnDynamicAsync*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TFormOnServer*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TParentSubmitMeta*/ Record<string, any> | undefined
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
