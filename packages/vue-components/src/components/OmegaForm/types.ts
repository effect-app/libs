/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DeepKeys,
  DeepValue,
  FieldAsyncValidateOrFn,
  FieldValidateOrFn,
  FormApi,
  FormAsyncValidateOrFn,
  FormOptions,
  FormState,
  FormValidateOrFn,
  StandardSchemaV1,
  VueFormApi
} from "@tanstack/vue-form"
import type { Effect } from "effect-app"
import type { Fiber as EffectFiber } from "effect/Fiber"
import type { Redacted } from "effect/Redacted"
import type { OmegaFieldInternalApi } from "./InputProps"
import type { MetaRecord } from "./meta/types"
import type { OF, OmegaFormReturn } from "./useOmegaForm"

export type FieldPath<T> = unknown extends T ? string
  // technically we cannot have primitive at the root
  : T extends string | boolean | number | null | undefined | symbol | bigint | Redacted<any> ? ""
  // technically we cannot have array at the root
  : T extends ReadonlyArray<infer U> ? FieldPath_<U, `[${number}]`>
  : {
    [K in keyof T]: FieldPath_<T[K], `${K & string}`>
  }[keyof T]

export type FieldPath_<T, Path extends string> = unknown extends T ? string
  : T extends string | boolean | number | null | undefined | symbol | bigint | Redacted<any> ? Path
  : T extends ReadonlyArray<infer U> ? FieldPath_<U, `${Path}[${number}]`> | Path
  : {
    [K in keyof T]: FieldPath_<T[K], `${Path}.${K & string}`>
  }[keyof T]

export type BaseProps<From, TName extends FieldPath<From>> = {
  /**
   * Will fallback to i18n when not specified.
   * Can also be provided via #label slot for custom HTML labels.
   * When using the slot, it receives bindings: { required, id, label }
   */
  label?: string
  validators?: FieldValidators<From>
  // Use FlexibleArrayPath: if name contains [], just use TName; otherwise intersect with Leaves<From>
  name: TName
  /**
   * Optional class to apply to the input element.
   * - If a string is provided, it will be used instead of the general class
   * - If null is provided, no class will be applied (neither inputClass nor general class)
   * - If undefined (not provided), the general class will be used
   */
  inputClass?: string | null
}

export type TypesWithOptions = "radio" | "select" | "multiple" | "autocomplete" | "autocompletemultiple"
export type DefaultTypeProps = {
  type?: TypeOverride
  options?: undefined
} | {
  type?: TypesWithOptions
  // TODO: options should depend on `type`, but since there is auto-type, we can't currently enforce it.
  // hence we allow it also for type? (undefined) atm
  options?: {
    title: string
    value: unknown
  }[]
}

export type OmegaInputPropsBase<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> = {
  form: OF<From, To> & {
    meta: MetaRecord<From>
    i18nNamespace?: string
  }
} & BaseProps<From, Name>

export type OmegaInputProps<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>,
  TypeProps = DefaultTypeProps
> = {
  form: OmegaFormReturn<From, To, TypeProps> & {
    meta: MetaRecord<From>
    i18nNamespace?: string
  }
} & BaseProps<From, Name>

export type OmegaArrayProps<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> =
  & Omit<
    OmegaInputProps<From, To, Name>,
    "validators" | "options" | "label" | "type" | "items" | "name"
  >
  & {
    name: DeepKeys<From>
    defaultItems?: DeepValue<From, DeepKeys<From>>
    // deprecated items, caused bugs in state update, use defaultItems instead. It's not a simple Never, because Volar explodes
    items?: "please use `defaultItems` instead"
  }

export type TypeOverride =
  | "string"
  | "text"
  | "number"
  | "select"
  | "multiple"
  | "boolean"
  | "radio"
  | "autocomplete"
  | "autocompletemultiple"
  | "switch"
  | "range"
  | "password"
  | "email"
  | "date"

export interface OmegaError {
  label: string
  inputId: string
  errors: readonly string[]
}

export type FormProps<From, To> =
  & Omit<
    FormOptions<
      From,
      FormValidateOrFn<From> | undefined,
      FormValidateOrFn<From> | undefined,
      StandardSchemaV1<From, To>,
      FormValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      FormValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      FormValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      Record<string, any> | undefined // TODO
    >,
    | "onSubmit"
    | "defaultValues"
  >
  & {
    // when defaultValues are allowed to be undefined, then they should also be allowed to be partial
    // this fixes validator issues where a defaultValue of "" leads to "requires at least 1 character", while manually emptying the field changes it to "is required"
    defaultValues?: Partial<From>
    onSubmit?: (props: {
      formApi: OmegaFormParams<From, To>
      meta: any
      value: To
    }) => Promise<any> | EffectFiber<any, any> | Effect.Effect<unknown, any, never>
  }

export type OmegaFormParams<From, To> = FormApi<
  From,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  StandardSchemaV1<From, To>,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  Record<string, any> | undefined
>

export type OmegaFormState<From, To> = FormState<
  From,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  StandardSchemaV1<From, To>,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined
>

// TODO: stitch TSubmitMeta somehow
export type OmegaFormApi<From, To, TSubmitMeta = Record<string, any> | undefined> =
  & OmegaFormParams<From, To>
  & VueFormApi<
    From,
    FormValidateOrFn<From> | undefined,
    FormValidateOrFn<From> | undefined,
    StandardSchemaV1<From, To>,
    FormValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    FormValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    FormValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    TSubmitMeta
  >

export type FormComponent<T, S> = VueFormApi<
  T,
  FormValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  StandardSchemaV1<T, S>,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  Record<string, any> | undefined
>

export type FormType<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> = OmegaFormApi<From, To> & {
  Field: OmegaFieldInternalApi<From, Name>
}

export type PrefixFromDepth<
  K extends string | number,
  _TDepth extends any[]
> = K

export type FieldValidators<T> = {
  onChangeAsync?: FieldAsyncValidateOrFn<T, any, any>
  onChange?: FieldValidateOrFn<T, any, any>
  onBlur?: FieldValidateOrFn<T, any, any>
  onBlurAsync?: FieldAsyncValidateOrFn<T, any, any>
}

export type OmegaAutoGenMeta<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> = Omit<OmegaInputProps<From, To, Name>, "form">
