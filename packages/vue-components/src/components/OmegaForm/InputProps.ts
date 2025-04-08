/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FieldApi, DeepValue, ValidationError } from "@tanstack/vue-form"
import { type NestedKeyOf } from "./OmegaFormStuff"

// Placeholder types for validator function shapes
type ValidatorFnSync = (opts: {
  value: any
  fieldApi: any
}) => ValidationError | undefined
type ValidatorFnAsync = (opts: {
  value: any
  fieldApi: any
}) => Promise<ValidationError | undefined>
// Assuming form validators have a similar structure but might operate on the whole form data (any for simplicity)
type FormValidatorFnSync = (opts: {
  value: any
  formApi: any
}) => ValidationError | undefined
type FormValidatorFnAsync = (opts: {
  value: any
  formApi: any
}) => Promise<ValidationError | undefined>
// Placeholder for other form-related types
type FormServerError = any
type SubmitMeta = any

// Define a more flexible Updater type that can accept direct values
type FlexibleUpdater<T> = ((prev: T) => T) | T

export type OmegaFieldInternalApi<To> = Omit<
  FieldApi<
    To, // TParentData
    NestedKeyOf<To>, // TName
    DeepValue<To, NestedKeyOf<To>>, // TData
    // Field Validators (approximated typqes)
    ValidatorFnSync, // TOnMount
    ValidatorFnSync, // TOnChange
    ValidatorFnAsync, // TOnChangeAsync
    ValidatorFnSync, // TOnBlur
    ValidatorFnAsync, // TOnBlurAsync
    ValidatorFnSync, // TOnSubmit
    ValidatorFnAsync, // TOnSubmitAsync
    // Form Validators (approximated types)
    FormValidatorFnSync, // TFormOnMount
    FormValidatorFnSync, // TFormOnChange
    FormValidatorFnAsync, // TFormOnChangeAsync
    FormValidatorFnSync, // TFormOnBlur
    FormValidatorFnAsync, // TFormOnBlurAsync
    FormValidatorFnSync, // TFormOnSubmit
    FormValidatorFnAsync, // TFormOnSubmitAsync
    // Other Form types (placeholders)
    FormServerError, // TFormOnServer
    SubmitMeta // TParentSubmitMeta
  >,
  "handleChange" | "setValue"
> & {
  handleChange: (
    updater: FlexibleUpdater<DeepValue<To, NestedKeyOf<To>>> | any,
  ) => void
  setValue: (
    updater: FlexibleUpdater<DeepValue<To, NestedKeyOf<To>>> | any,
  ) => void
}

export type InputProps<T> = {
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
  field: OmegaFieldInternalApi<T>
  setRealDirty: () => void
  type: string
  label: string
  options?: { title: string; value: string }[]
}
