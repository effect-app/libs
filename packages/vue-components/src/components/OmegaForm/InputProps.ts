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
  inputProps: {
    id: string
    required?: boolean
    minLength?: number | false
    maxLength?: number | false
    max?: number | false
    min?: number | false
    errorMessages: string[]
    error: boolean
    label: string
    type: string
    inputClass: string | undefined | null
  }
  field: OmegaFieldInternalApi<From, TName>
  /** be sure to use this state and not `field.state` as it is not reactive */
  state: OmegaFieldInternalApi<From, TName>["state"]
}

export type MergedInputProps<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> =
  & InputProps<From, TName>["inputProps"]
  & Pick<InputProps<From, TName>, "field" | "state">

export type VuetifyInputProps<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = {
  inputProps: InputProps<From, TName>["inputProps"] & {
    type: string
    options?: { title: string; value: unknown }[]
  }
} & Pick<InputProps<From, TName>, "field" | "state">

// Utility type to extract _tag literal values from a discriminated union
// For a union like { _tag: "A", ... } | { _tag: "B", ... }, this returns "A" | "B"
// For nullable unions like { _tag: "A" } | { _tag: "B" } | null, this still returns "A" | "B" (excluding null)
export type ExtractTagValue<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> =
  DeepValue<From, TName> extends infer U ? U extends { _tag: infer Tag } ? Tag
    : never
    : never

// Utility type to extract a specific branch from a discriminated union based on _tag value
// For union { _tag: "A", foo: string } | { _tag: "B", bar: number } and Tag="A", returns { _tag: "A", foo: string }
export type ExtractUnionBranch<T, Tag> = T extends { _tag: Tag } ? T
  : never

// Option type for TaggedUnion component with strongly-typed value
// The value can be either one of the _tag values OR null (for the placeholder)
export type TaggedUnionOption<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = {
  readonly title: string
  readonly value: ExtractTagValue<From, TName> | null
}

// Options array must ALWAYS start with a null option (placeholder), followed by the actual options
export type TaggedUnionOptionsArray<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = readonly [
  { readonly title: string; readonly value: null },
  ...ReadonlyArray<{ readonly title: string; readonly value: ExtractTagValue<From, TName> }>
]

// Props for TaggedUnion component
export type TaggedUnionProps<From extends Record<PropertyKey, any>, TName extends DeepKeys<From>> = {
  name: TName
  options: TaggedUnionOptionsArray<From, TName>
}
