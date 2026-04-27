/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { DeepValue, type FormAsyncValidateOrFn, type FormValidateOrFn, type StandardSchemaV1, useForm } from "@tanstack/vue-form"
import { Array, Context, Effect, Order, S } from "effect-app"
import { UnionToTuples } from "effect-app/utils"
import { ComputedRef, type InjectionKey, ref, watch } from "vue"
import { eHoc, makeFieldMap } from "./errors"
import { fHoc } from "./hocs"
import { MergedInputProps } from "./InputProps"
import OmegaArray from "./OmegaArray.vue"
import OmegaAutoGen from "./OmegaAutoGen.vue"
import OmegaErrorsInternal from "./OmegaErrorsInternal.vue"
import { BaseProps, defaultsValueFromSchema, DefaultTypeProps, FieldPath, type FormProps, generateMetaFromSchema, type MetaRecord, type NestedKeyOf, OmegaArrayProps, OmegaAutoGenMeta, OmegaError, type OmegaFormApi, OmegaFormState, toFormSchema } from "./OmegaFormStuff"
import OmegaInput from "./OmegaInput.vue"
import OmegaTaggedUnion from "./OmegaTaggedUnion.vue"
import OmegaForm from "./OmegaWrapper.vue"
import { type defaultValuesPriorityUnion as PersistencyPriority, type Policies as PersistencyPolicies, usePersistency } from "./persistency"
import { FormErrors, makeSubmitHandlers, wrapOnSubmit } from "./submit"

import { makeRunPromise } from "@effect-app/vue/runtime"

export { FormErrors } from "./submit"
export { useErrorLabel } from "./errors"

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

export const OmegaFormKey = Symbol("OmegaForm") as InjectionKey<OF<any, any>>

type __VLS_PrettifyLocal<T> =
  & {
    [K in keyof T]: T[K]
  }
  & {}

// Type aliases for Array component slots - using cached types for performance
type CachedFieldApi<From, To, TypeProps = DefaultTypeProps> = import("@tanstack/vue-form").FieldApi<
  From,
  OmegaFormReturn<From, To, TypeProps>["_keys"],
  DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").StandardSchemaV1<From, To>,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  Record<string, any> | undefined
>

type CachedFieldState<From, To, TypeProps = DefaultTypeProps> = import("@tanstack/vue-form").FieldState<
  From,
  OmegaFormReturn<From, To, TypeProps>["_keys"],
  DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").StandardSchemaV1<From, To>,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined
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
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & TypeProps
          & Partial<{}>
        >
        & BaseProps<From, Name>
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default?(props: MergedInputProps<From, Name>): void
        label?: (props: { required: boolean; id: string; label: string }) => void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
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
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & Partial<{}>
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default: (props: { errors: readonly OmegaError[]; showedGeneralErrors: string[] }) => void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
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
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & {
            name?: Name
            type?: "select" | "radio"
            options: import("./InputProps").TaggedUnionOptionsArray<From, Name>
            _debugName?: [NoInfer<Name>]
            label?: string
          }
          & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: Record<
        string,
        (props: {
          field: import("@tanstack/vue-form").FieldApi<
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
          state: import("@tanstack/vue-form").FieldState<
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
  ) => import("vue").VNode & {
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
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & (Omit<OmegaArrayProps<From, To, Name>, "form">)
          & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
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
  ) => import("vue").VNode & {
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
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
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
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          child: OmegaAutoGenMeta<From, To, Name>
        }): void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
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
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          > & {
            // form: OmegaFormReturn<From, To, Props>
            disabled?: boolean
            subscribe?: K[]
          } & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          subscribedValues: K[] extends undefined[] ? Record<string, never> : Pick<OmegaFormState<From, To>, K>
        }): void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
}

const runPromise = makeRunPromise(Context.empty())

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
>(
  schema: S.Codec<To, From, never>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To, TypeProps> => {
  if (!schema) throw new Error("Schema is required")
  const formCompatibleSchema = toFormSchema(schema)
  const standardSchema = S.toStandardSchemaV1(formCompatibleSchema)
  const decode = S.decodeUnknownEffect(formCompatibleSchema)

  const { meta, unionMeta } = generateMetaFromSchema(formCompatibleSchema)

  // Persistency must be created before `useForm` so its merged
  // `defaultValues` (tanstack + storage/querystring + schema) can flow into
  // the form. The `getForm` accessor is lazy because the form is constructed
  // immediately after, and persistency's listeners only fire later.
  const formHolder: { form: any } = { form: undefined }
  const persistency = usePersistency<From>({
    meta,
    persistency: omegaConfig?.persistency,
    preventWindowExit: omegaConfig?.preventWindowExit,
    defaultValuesPriority: omegaConfig?.defaultValuesPriority,
    tanstackDefaultValues: tanstackFormOptions?.defaultValues,
    schemaDefaultValues: () => defaultsValueFromSchema(schema),
    getForm: () => formHolder.form
  })

  const form = useForm<
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
  >({
    ...tanstackFormOptions,
    validators: {
      onSubmit: standardSchema,
      ...tanstackFormOptions?.validators
    },
    onSubmit: wrapOnSubmit<From, To>(tanstackFormOptions?.onSubmit, decode, runPromise),
    defaultValues: persistency.defaultValues.value as any
  }) satisfies OmegaFormApi<To, From>
  formHolder.form = form

  const clear = () => {
    Object.keys(meta).forEach((key: any) => {
      form.setFieldValue(key, undefined as any)
    })
  }

  // (Persistency listener wiring + storage/querystring read/write lives in `usePersistency`.)

  // Watch for successful form submissions and auto-reset if prevent-and-reset is enabled
  // We put it as a side effect, so we don't overwhelm submit handler and we can support
  // effects submission more freely
  if (omegaConfig?.preventWindowExit === "prevent-and-reset") {
    const isSubmitting = form.useStore((state) => state.isSubmitting)
    const submissionAttempts = form.useStore((state) => state.submissionAttempts)
    const canSubmit = form.useStore((state) => state.canSubmit)
    const values = form.useStore((state) => state.values)

    watch([isSubmitting, submissionAttempts], ([currentlySubmitting, attempts], [wasSubmitting]) => {
      // Detect successful submission: was submitting, now not submitting, and submission count increased
      if (wasSubmitting && !currentlySubmitting && attempts > 0 && canSubmit.value) {
        // Reset with current values to mark them as the new baseline
        form.reset(values.value)
      }
    })
  }

  const { handleSubmit, handleSubmitEffect } = makeSubmitHandlers<From, To>(form)

  const { fieldMap, registerField } = makeFieldMap()

  const formWithExtras: OF<From, To> = Object.assign(form, {
    i18nNamespace: omegaConfig?.i18nNamespace,
    ignorePreventCloseEvents: omegaConfig?.ignorePreventCloseEvents,
    meta,
    unionMeta,
    clear,
    handleSubmit,
    // /** @experimental */
    handleSubmitEffect,
    registerField
  })

  // Clear all field onSubmit errors when any value changes after a failed submission.
  // Form-level onSubmit validation (e.g. union schemas) distributes errors to individual fields.
  // TanStack only clears the changed field's onSubmit error, leaving sibling fields with stale
  // errors that keep isFieldsValid=false and block re-submission.
  const lastSubmitAttempts = ref(0)
  const submissionAttempts = form.useStore((s) => s.submissionAttempts)
  const formValues = form.useStore((s) => s.values)
  watch(formValues, () => {
    if (lastSubmitAttempts.value === submissionAttempts.value) return
    lastSubmitAttempts.value = submissionAttempts.value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const info of Object.values(form.fieldInfo) as any[]) {
      if (info?.instance?.state.meta.errorMap?.onSubmit) {
        info.instance.setMeta((prev: any) => ({ ...prev, errorMap: { ...prev.errorMap, onSubmit: undefined } }))
      }
    }
  }, { deep: true })

  const errorContext = { form: formWithExtras, fieldMap }

  return Object.assign(formWithExtras, {
    // Type-level properties for performance optimization (not used at runtime)
    _paths: undefined as any,
    _keys: undefined as any,
    _schema: schema,
    errorContext,
    Form: fHoc(formWithExtras)(OmegaForm as any) as any,
    Input: fHoc(formWithExtras)(omegaConfig?.input ?? OmegaInput) as any,
    TaggedUnion: fHoc(formWithExtras)(OmegaTaggedUnion) as any,
    Field: form.Field,
    Errors: eHoc(errorContext)(OmegaErrorsInternal) as any,
    Array: fHoc(formWithExtras)(OmegaArray) as any,
    AutoGen: fHoc(formWithExtras)(OmegaAutoGen as any) as any
  })
}
