import type { FieldApi, DeepValue, ValidationError } from "@tanstack/vue-form";
import { NestedKeyOf } from "./OmegaFormStuff"

// Placeholder types for validator function shapes
type ValidatorFnSync = (opts: { value: any; fieldApi: any }) => ValidationError | undefined;
type ValidatorFnAsync = (opts: { value: any; fieldApi: any }) => Promise<ValidationError | undefined>;
// Assuming form validators have a similar structure but might operate on the whole form data (any for simplicity)
type FormValidatorFnSync = (opts: { value: any; formApi: any }) => ValidationError | undefined;
type FormValidatorFnAsync = (opts: { value: any; formApi: any }) => Promise<ValidationError | undefined>;
// Placeholder for other form-related types
type FormServerError = any;
type SubmitMeta = any;

export type FieldApiForAndrea<To> = FieldApi<
  To, // TParentData
  NestedKeyOf<To>, // TName
  DeepValue<To, NestedKeyOf<To>>, // TData
  // Field Validators (approximated typqes)
  ValidatorFnSync,    // TOnMount
  ValidatorFnSync,    // TOnChange
  ValidatorFnAsync,   // TOnChangeAsync
  ValidatorFnSync,    // TOnBlur
  ValidatorFnAsync,   // TOnBlurAsync
  ValidatorFnSync,    // TOnSubmit
  ValidatorFnAsync,   // TOnSubmitAsync
  // Form Validators (approximated types)
  FormValidatorFnSync,  // TFormOnMount
  FormValidatorFnSync,  // TFormOnChange
  FormValidatorFnAsync, // TFormOnChangeAsync
  FormValidatorFnSync,  // TFormOnBlur
  FormValidatorFnAsync, // TFormOnBlurAsync
  FormValidatorFnSync,  // TFormOnSubmit
  FormValidatorFnAsync, // TFormOnSubmitAsync
  // Other Form types (placeholders)
  FormServerError,    // TFormOnServer
  SubmitMeta          // TParentSubmitMeta
>
