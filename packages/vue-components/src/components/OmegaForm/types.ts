/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DeepKeys, DeepValue, FieldApi, FieldAsyncValidateOrFn, FieldState, FieldValidateOrFn, FormApi, FormAsyncValidateOrFn, FormOptions, FormState, FormValidateOrFn, StandardSchemaV1, VueFormApi } from "@tanstack/vue-form"
import type { Effect, Order, S } from "effect-app"
import type { UnionToTuples } from "effect-app/utils"
import type { Fiber as EffectFiber } from "effect/Fiber"
import type { Redacted } from "effect/Redacted"
import type { AllowedComponentProps, ComponentCustomProps, ComputedRef, PublicProps, ShallowUnwrapRef, VNode, VNodeProps } from "vue"
import type { MergedInputProps, OmegaFieldInternalApi, TaggedUnionOptionsArray } from "./InputProps"
import type { MetaRecord, NestedKeyOf } from "./meta/types"
import type { defaultValuesPriorityUnion as PersistencyPriority, Policies as PersistencyPolicies } from "./persistency"
import type { FormErrors } from "./submit"

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

type keysRule<T> =
  | {
    keys?: NestedKeyOf<T>[]
    banKeys?: "You should only use one of banKeys or keys, not both, moron"
  }
  | {
    keys?: "You should only use one of banKeys or keys, not both, moron"
    banKeys?: NestedKeyOf<T>[]
  }

export type Policies = PersistencyPolicies
export type defaultValuesPriorityUnion = PersistencyPriority

export type OmegaConfig<T> = {
  i18nNamespace?: string

  persistency?: {
    /** Order of importance:
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: UnionToTuples<Policies>
    overrideDefaultValues?: "deprecated: use defaultValuesPriority"
    id?: string
  } & keysRule<T>

  ignorePreventCloseEvents?: boolean

  /**
   * Prevents browser window/tab exit when form has unsaved changes.
   * Shows native browser "Leave site?" dialog.
   *
   * @remarks
   * - Opt-in only: Must explicitly enable
   * - Independent from data persistence feature
   */
  preventWindowExit?: "prevent" | "prevent-and-reset" | "nope"

  input?: any

  /**
   * Default values order is: Tanstack default values passed as second parameter to useOmegaForm, then persistency
   * default values from querystring or local/session storage, then defaults from schema
   * You can customize the order and  with omegaConfig.defaultValuesPriority
   * default value = ['tanstack', 'persistency', 'schema']
   */
  defaultValuesPriority?: UnionToTuples<defaultValuesPriorityUnion>

  defaultFromSchema?: "deprecated: use defaultValuesPriority"
}

export interface OF<From, To> extends OmegaFormApi<From, To> {
  meta: MetaRecord<From>
  unionMeta: Record<string, MetaRecord<From>>
  clear: () => void
  i18nNamespace?: string
  ignorePreventCloseEvents?: boolean
  registerField: (
    field: ComputedRef<{
      name: string
      label: string
      id: string
    }>
  ) => void
  /** @experimental */
  handleSubmitEffect: {
    /**
     * when `checkErrors` is true, the Effect will fail with `FormErrors<From>` when there are validation errors
     * @experimental */
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    /** @experimental */
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  }
}

type __VLS_PrettifyLocal<T> =
  & {
    [K in keyof T]: T[K]
  }
  & {}

// Type aliases for Array component slots - using cached types for performance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CachedFieldApi<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
> = FieldApi<
  From,
  OmegaFormReturn<From, To, TypeProps>["_keys"],
  DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CachedFieldState<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
> = FieldState<
  From,
  OmegaFormReturn<From, To, TypeProps>["_keys"],
  DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  StandardSchemaV1<From, To>,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined
>

export interface OmegaFormReturn<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
> extends OF<From, To> {
  // Pre-computed type aliases - computed ONCE for performance
  _paths: FieldPath<From>
  _keys: NestedKeyOf<From>
  _schema: S.Codec<To, From, never>

  // this crazy thing here is copied from the OmegaFormInput.vue.d.ts, with `From` removed as Generic, instead closed over from the From generic above..
  Input: <Name extends OmegaFormReturn<From, To, TypeProps>["_paths"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & VNodeProps & AllowedComponentProps & ComponentCustomProps,
              never
            >,
            never
          >
          & TypeProps
          & Partial<{}>
        >
        & BaseProps<From, Name>
        & PublicProps
      expose(exposed: ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default?(props: MergedInputProps<From, Name>): void
        label?: (props: { required: boolean; id: string; label: string }) => void
      }
      emit: {}
    }>
  ) => VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
  Errors: (
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & VNodeProps & AllowedComponentProps & ComponentCustomProps,
              never
            >,
            never
          >
          & Partial<{}>
        >
        & PublicProps
      expose(exposed: ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default: (props: { errors: readonly OmegaError[]; showedGeneralErrors: string[] }) => void
      }
      emit: {}
    }>
  ) => VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
  TaggedUnion: <Name extends OmegaFormReturn<From, To, TypeProps>["_keys"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & VNodeProps & AllowedComponentProps & ComponentCustomProps,
              never
            >,
            never
          >
          & {
            name?: Name
            type?: "select" | "radio"
            options: TaggedUnionOptionsArray<From, Name>
            _debugName?: [NoInfer<Name>]
            label?: string
          }
          & {}
        >
        & PublicProps
      expose(exposed: ShallowUnwrapRef<{}>): void
      attrs: any
      slots: Record<
        string,
        (props: {
          field: FieldApi<
            From,
            Name,
            DeepValue<From, Name>,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any
          >
          state: FieldState<
            From,
            Name,
            DeepValue<From, Name>,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any
          >
        }) => any
      >
      emit: {}
    }>
  ) => VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
  Array: <Name extends OmegaFormReturn<From, To, TypeProps>["_keys"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & VNodeProps & AllowedComponentProps & ComponentCustomProps,
              never
            >,
            never
          >
          & (Omit<OmegaArrayProps<From, To, Name>, "form">)
          & {}
        >
        & PublicProps
      expose(exposed: ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        "pre-array"?: (props: {
          field: CachedFieldApi<From, To, TypeProps>
          state: CachedFieldState<From, To, TypeProps>
        }) => any
      } & {
        default?: (props: {
          subField: CachedFieldApi<From, To, TypeProps>
          subState: CachedFieldState<From, To, TypeProps>
          index: number
          field: CachedFieldApi<From, To, TypeProps>
        }) => any
      } & {
        "post-array"?: (props: {
          field: CachedFieldApi<From, To, TypeProps>
          state: CachedFieldState<From, To, TypeProps>
        }) => any
      } & {
        field?: (props: {
          field: CachedFieldApi<From, To, TypeProps>
        }) => any
      }
      emit: {}
    }>
  ) => VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }

  AutoGen: <Name extends OmegaFormReturn<From, To, TypeProps>["_keys"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          Pick<
            & Partial<{}>
            & Omit<
              {} & VNodeProps & AllowedComponentProps & ComponentCustomProps,
              never
            >,
            never
          > & {
            // form: OmegaInputProps<From, To>["form"]
            pick?: OmegaFormReturn<From, To, TypeProps>["_keys"][]
            omit?: OmegaFormReturn<From, To, TypeProps>["_keys"][]
            labelMap?: (key: OmegaFormReturn<From, To, TypeProps>["_keys"]) => string | undefined
            filterMap?: <M extends OmegaAutoGenMeta<From, To, Name>>(
              key: OmegaFormReturn<From, To, TypeProps>["_keys"],
              meta: M
            ) => boolean | M
            order?: OmegaFormReturn<From, To, TypeProps>["_keys"][]
            sort?: Order.Order<OmegaAutoGenMeta<From, To, Name>>
          } & {}
        >
        & PublicProps
      expose(exposed: ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          child: OmegaAutoGenMeta<From, To, Name>
        }): void
      }
      emit: {}
    }>
  ) => VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }

  Form: <K extends keyof OmegaFormState<To, From>>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          Pick<
            & Partial<{}>
            & Omit<
              {} & VNodeProps & AllowedComponentProps & ComponentCustomProps,
              never
            >,
            never
          > & {
            // form: OmegaFormReturn<From, To, Props>
            disabled?: boolean
            subscribe?: K[]
          } & {}
        >
        & PublicProps
      expose(exposed: ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          subscribedValues: K[] extends undefined[] ? Record<string, never> : Pick<OmegaFormState<From, To>, K>
        }): void
      }
      emit: {}
    }>
  ) => VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
}
