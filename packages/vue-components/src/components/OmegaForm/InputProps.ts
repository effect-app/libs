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
  /* in out TFormOnMount*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnChange*/ FormValidateOrFn<From> | undefined,
  // using `any` for now to silence:
  /*
Type 'FieldApi<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>, FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<...>>> | undefined, ... 14 more ..., FormAsyncValidateOrFn<...> | undefined>' is not assignable to type 'OmegaFieldInternalApi<From, any>'.
  The types of 'form.options.defaultState' are incompatible between these types.
    Type 'Partial<FormState<From, FormValidateOrFn<From> | undefined, FormValidateOrFn<From> | undefined, StandardSchemaV1<From, To>, ... 4 more ..., FormAsyncValidateOrFn<...> | undefined>> | undefined' is not assignable to type 'Partial<FormState<From, FormValidateOrFn<From> | undefined, FormValidateOrFn<From> | undefined, FormAsyncValidateOrFn<From>, ... 4 more ..., FormAsyncValidateOrFn<...> | undefined>> | undefined'.
      Type 'Partial<FormState<From, FormValidateOrFn<From> | undefined, FormValidateOrFn<From> | undefined, StandardSchemaV1<From, To>, ... 4 more ..., FormAsyncValidateOrFn<...> | undefined>>' is not assignable to type 'Partial<FormState<From, FormValidateOrFn<From> | undefined, FormValidateOrFn<From> | undefined, FormAsyncValidateOrFn<From>, ... 4 more ..., FormAsyncValidateOrFn<...> | undefined>>'.
        Types of property 'errorMap' are incompatible.
          Type 'FormValidationErrorMap<undefined, undefined, Record<string, StandardSchemaV1Issue[]>, undefined, undefined, undefined, undefined, undefined> | undefined' is not assignable to type 'FormValidationErrorMap<undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined> | undefined'.
            Type 'FormValidationErrorMap<undefined, undefined, Record<string, StandardSchemaV1Issue[]>, undefined, undefined, undefined, undefined, undefined>' is not assignable to type 'FormValidationErrorMap<undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined>'.
              Type 'Record<string, StandardSchemaV1Issue[]>' is not assignable to type 'undefined'.
  */
  /* in out TFormOnChangeAsync*/ any, // FormAsyncValidateOrFn<From>,
  /* in out TFormOnBlur*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnBlurAsync*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TFormOnSubmit*/ FormValidateOrFn<From> | undefined,
  /* in out TFormOnSubmitAsync*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TFormOnServer*/ FormAsyncValidateOrFn<From> | undefined,
  /* in out TParentSubmitMeta*/ FormAsyncValidateOrFn<From> | undefined
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
