/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as api from "@opentelemetry/api"
import { type DeepKeys, DeepValue, type FormAsyncValidateOrFn, type FormValidateOrFn, type StandardSchemaV1, StandardSchemaV1Issue, useForm, ValidationError, ValidationErrorMap } from "@tanstack/vue-form"
import { Array, Data, Effect, Fiber, Option, Order, S } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import { isObject } from "effect/Predicate"
import { Component, computed, ComputedRef, ConcreteComponent, h, type InjectionKey, onBeforeUnmount, onMounted, onUnmounted, Ref, ref, watch } from "vue"
import { MergedInputProps } from "./InputProps"
import OmegaArray from "./OmegaArray.vue"
import OmegaAutoGen from "./OmegaAutoGen.vue"
import OmegaErrorsInternal from "./OmegaErrorsInternal.vue"
import { BaseProps, DefaultTypeProps, FieldPath, type FormProps, generateMetaFromSchema, type MetaRecord, type NestedKeyOf, OmegaAutoGenMeta, OmegaError, type OmegaFormApi, OmegaFormState } from "./OmegaFormStuff"
import OmegaInput from "./OmegaInput.vue"
import OmegaTaggedUnion from "./OmegaTaggedUnion.vue"
import OmegaForm from "./OmegaWrapper.vue"

type keysRule<T> =
  | {
    keys?: NestedKeyOf<T>[]
    banKeys?: "You should only use one of banKeys or keys, not both, moron"
  }
  | {
    keys?: "You should only use one of banKeys or keys, not both, moron"
    banKeys?: NestedKeyOf<T>[]
  }

export class FormErrors<From> extends Data.TaggedError("FormErrors")<{
  form: {
    // TODO: error shapes seem off, with `undefined` etc..
    errors: (Record<string, StandardSchemaV1Issue[]> | undefined)[]
    errorMap: ValidationErrorMap<
      undefined,
      undefined,
      Record<string, StandardSchemaV1Issue[]>,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >
  }
  fields: Record<DeepKeys<From>, {
    errors: ValidationError[]
    errorMap: ValidationErrorMap
  }>
}> {}

const fHoc = (form: OF<any, any>) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      render() {
        return h(WrappedComponent, {
          form,
          ...this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

const eHoc = (errorProps: {
  form: OF<any, any>
  fieldMap: Ref<Map<string, { id: string; label: string }>>
}) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      setup() {
        const { fieldMap, form } = errorProps
        const generalErrors = form.useStore((state) => state.errors)
        const fieldMeta = form.useStore((state) => state.fieldMeta)
        const errorMap = form.useStore((state) => state.errorMap)

        const errors = computed(() => {
          // Collect errors from fieldMeta (field-level errors for registered fields)
          const fieldErrors = Array.filterMap(
            Object
              .entries(fieldMeta.value),
            ([key, m]): Option.Option<OmegaError> => {
              const fieldErrors = (m as any).errors ?? []
              if (!fieldErrors.length) return Option.none()

              const fieldInfo = fieldMap.value.get(key)
              // Only show errors for fields that are currently mounted (registered in fieldMap)
              if (!fieldInfo) return Option.none()

              return Option.some({
                label: fieldInfo.label,
                inputId: fieldInfo.id,
                // Only show the first error
                errors: [fieldErrors[0]?.message].filter(Boolean)
              })
            }
          )

          // Collect errors from errorMap.onSubmit ONLY for fields that are NOT registered
          // (registered fields already have their errors in fieldMeta)
          const submitErrors: OmegaError[] = []
          if (errorMap.value.onSubmit) {
            for (const [_, issues] of Object.entries(errorMap.value.onSubmit)) {
              if (Array.isArray(issues) && issues.length) {
                for (const issue of issues) {
                  const issAny: any = issue
                  if (issAny?.path && Array.isArray(issAny.path) && issAny.path.length) {
                    // Use the path from the issue to identify the field
                    const fieldPath = issAny.path.join(".")
                    // Only add errors for fields that are NOT registered (not in fieldMap)
                    // Registered fields will already have their errors from fieldMeta
                    if (!fieldMap.value.has(fieldPath)) {
                      submitErrors.push({
                        label: fieldPath,
                        inputId: fieldPath,
                        errors: [issAny.message].filter(Boolean)
                      })
                      // Only show first error per field, so break after adding
                      break
                    }
                  }
                }
              }
            }
          }

          // Combine both error sources (no need to check for duplicates since they're mutually exclusive)
          return [...fieldErrors, ...submitErrors]
        })

        return {
          generalErrors,
          errors
        }
      },
      render({ errors, generalErrors }: any) {
        return h(WrappedComponent, {
          errors,
          generalErrors,
          ...this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

export type OmegaConfig<T> = {
  i18nNamespace?: string

  persistency?: {
    /** Order of importance:
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: ("local" | "session" | "querystring")[]
    overrideDefaultValues?: boolean
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
}

export interface OF<From, To> extends OmegaFormApi<From, To> {
  meta: MetaRecord<From>
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

export interface OmegaFormReturn<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
> extends OF<From, To> {
  // Pre-bound Input component with type-checked Name parameter
  Input: <Name extends FieldPath<From>>(
    props: BaseProps<From, Name> & TypeProps & {
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default?(props: MergedInputProps<From, Name>): any
        label?: (props: { required: boolean; id: string; label: string }) => any
      }
      attrs?: Record<string, any>
    }
  ) => import("vue").VNode
  Errors: (
    props?: {
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default: (props: { errors: readonly OmegaError[]; showedGeneralErrors: string[] }) => any
      }
      attrs?: Record<string, any>
    }
  ) => import("vue").VNode
  TaggedUnion: <Name extends DeepKeys<From>>(
    props: {
      name: Name
      type?: "select" | "radio"
      options: import("./InputProps").TaggedUnionOptionsArray<From, Name>
      label?: string
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: Record<
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
      attrs?: Record<string, any>
    }
  ) => import("vue").VNode
  Array: <Name extends DeepKeys<From>>(
    props: {
      name: Name
      defaultItems?: DeepValue<From, Name>
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        "pre-array"?: (props: { field: any; state: any }) => any
        default?: (props: { subField: any; subState: any; index: number; field: any }) => any
        "post-array"?: (props: { field: any; state: any }) => any
        field?: (props: { field: any }) => any
      }
      attrs?: Record<string, any>
    }
  ) => import("vue").VNode

  AutoGen: (
    props: {
      pick?: DeepKeys<From>[]
      omit?: DeepKeys<From>[]
      labelMap?: (key: DeepKeys<From>) => string | undefined
      filterMap?: <M extends OmegaAutoGenMeta<From, To>>(key: DeepKeys<From>, meta: M) => boolean | M
      order?: DeepKeys<From>[]
      sort?: Order.Order<OmegaAutoGenMeta<From, To>>
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default(props: { child: OmegaAutoGenMeta<From, To> }): any
      }
      attrs?: Record<string, any>
    }
  ) => import("vue").VNode

  Form: <K extends keyof OmegaFormState<From, To>>(
    props: {
      disabled?: boolean
      subscribe?: K[]
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default(props: {
          subscribedValues: K[] extends undefined[] ? Record<string, never> : Pick<OmegaFormState<From, To>, K>
        }): any
      }
      attrs?: Record<string, any>
    }
  ) => import("vue").VNode
}

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
>(
  schema: S.Schema<To, From, never>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To, TypeProps> => {
  if (!schema) throw new Error("Schema is required")
  const standardSchema = S.standardSchemaV1(schema)
  const decode = S.decode(schema)

  const { meta } = generateMetaFromSchema(schema)

  const persistencyKey = computed(() => {
    if (omegaConfig?.persistency?.id) {
      return omegaConfig.persistency.id
    }
    const path = window.location.pathname
    const keys = Object.keys(meta)
    return `${path}-${keys.join("-")}`
  })

  const clearUrlParams = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete(persistencyKey.value)
    const url = new URL(window.location.href)
    url.search = params.toString()
    window.history.replaceState({}, "", url.toString())
  }

  function deepMerge(target: any, source: any) {
    for (const key in source) {
      if (source[key] && isObject(source[key])) {
        if (!target[key]) {
          target[key] = {}
        }
        deepMerge(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    }
    return target
  }

  // Normalize default values based on schema metadata
  // Convert empty strings to null/undefined for nullable fields
  // Also initialize missing nullable fields with null/undefined
  const normalizeDefaultValues = (values: Partial<From>): Partial<From> => {
    const normalized: any = { ...values }

    // Process all fields in the schema metadata
    for (const key in meta) {
      const fieldMeta = meta[key as keyof typeof meta]
      const value = normalized[key]

      // Check if the value is falsy (but not boolean false or zero)
      const isFalsyButNotZero = value == null || value === false || value === "" || Number.isNaN(value)
      const isFalsy = isFalsyButNotZero && value !== false && value !== 0

      if (
        fieldMeta
        && !fieldMeta.required
        && fieldMeta.nullableOrUndefined
        && fieldMeta.type !== "boolean"
      ) {
        // If value is missing or falsy, set to null or undefined based on schema
        if (value === undefined || isFalsy) {
          normalized[key] = fieldMeta.nullableOrUndefined === "undefined" ? undefined : null
        }
      }
    }

    return normalized
  }

  const defaultValues = computed(() => {
    // Normalize tanstack default values at the beginning
    const normalizedTanstackDefaults = tanstackFormOptions?.defaultValues
      ? normalizeDefaultValues(tanstackFormOptions.defaultValues)
      : undefined

    if (
      normalizedTanstackDefaults
      && !omegaConfig?.persistency?.overrideDefaultValues
    ) {
      // defaultValues from tanstack are not partial,
      // so if ovverrideDefaultValues is false we return the normalized values
      return normalizedTanstackDefaults
    }

    // we are here because there are no default values from tankstack
    // or because omegaConfig?.persistency?.overrideDefaultValues is true

    // will contain what we get from querystring or local/session storage
    let defValuesPatch

    const persistency = omegaConfig?.persistency
    if (!persistency?.policies || persistency.policies.length === 0) return {}
    if (persistency.policies.includes("querystring")) {
      try {
        const params = new URLSearchParams(window.location.search)
        const value = params.get(persistencyKey.value)
        clearUrlParams()
        if (value) {
          defValuesPatch = JSON.parse(value)
        }
      } catch (error) {
        console.error(error)
      }
    }

    if (
      // query string has higher priority than local/session storage
      !defValuesPatch
      && (persistency.policies.includes("local")
        || persistency.policies.includes("session"))
    ) {
      const storage = persistency.policies.includes("local")
        ? localStorage
        : sessionStorage
      if (storage) {
        try {
          const value = JSON.parse(
            storage.getItem(persistencyKey.value) || "{}"
          )
          storage.removeItem(persistencyKey.value)
          defValuesPatch = value
        } catch (error) {
          console.error(error)
        }
      }
    }

    // to be sure we have a valid object at the end of the gathering process
    defValuesPatch ??= {}

    if (!normalizedTanstackDefaults) {
      // we just return what we gathered from the query/storage
      return defValuesPatch
    } else {
      return deepMerge(normalizedTanstackDefaults, defValuesPatch)
    }
  })

  const wrapWithSpan = (span: api.Span | undefined, toWrap: () => any) => {
    return span ? api.context.with(api.trace.setSpan(api.context.active(), span), toWrap) : toWrap()
  }

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
      ...(tanstackFormOptions?.validators || {})
    },
    onSubmit: tanstackFormOptions?.onSubmit
      ? ({ formApi, meta, value }) =>
        wrapWithSpan(meta?.currentSpan, async () => {
          // validators only validate, they don't actually transform, so we have to do that manually here.
          const parsedValue = await Effect.runPromise(decode(value))
          const r = tanstackFormOptions.onSubmit!({
            formApi: formApi as OmegaFormApi<From, To>,
            meta,
            value: parsedValue
          })
          if (Fiber.isFiber(r) && Fiber.isRuntimeFiber(r)) {
            return await runtimeFiberAsPromise(r)
          }
          if (Effect.isEffect(r)) {
            return await Effect.runPromise(
              r.pipe(
                // meta?.currentSpan
                //   ? Effect.withParentSpan(meta.currentSpan)
                //   : (_) => _,
                Effect.flatMap((_) => Fiber.join(_))
              )
            )
          }
          return r
        })
      : undefined,
    defaultValues: defaultValues.value as any
  }) satisfies OmegaFormApi<To, From>

  const clear = () => {
    Object.keys(meta).forEach((key: any) => {
      form.setFieldValue(key, undefined as any)
    })
  }

  const createNestedObjectFromPaths = (paths: string[]) =>
    paths.reduce((result, path) => {
      const parts = path.split(".")
      parts.reduce((acc, part, i) => {
        if (i === parts.length - 1) {
          acc[part] = form.getFieldValue(path as any)
        } else {
          acc[part] = acc[part] ?? {}
        }
        return acc[part]
      }, result)
      return result
    }, {} as Record<string, any>)

  const persistFilter = (persistency: OmegaConfig<From>["persistency"]) => {
    if (!persistency) return
    if (Array.isArray(persistency.keys)) {
      return createNestedObjectFromPaths(persistency.keys)
    }
    if (Array.isArray(persistency.banKeys)) {
      const subs = Object.keys(meta).filter((metakey) => persistency.banKeys?.includes(metakey as any))
      return createNestedObjectFromPaths(subs)
    }
    return form.store.state.values
  }

  const persistData = () => {
    const persistency = omegaConfig?.persistency
    if (!persistency?.policies || persistency.policies.length === 0) {
      return
    }
    if (
      persistency.policies.includes("local")
      || persistency.policies.includes("session")
    ) {
      const storage = persistency.policies.includes("local")
        ? localStorage
        : sessionStorage
      if (!storage) return
      const values = persistFilter(persistency)
      return storage.setItem(persistencyKey.value, JSON.stringify(values))
    }
  }

  const saveDataInUrl = () => {
    const persistency = omegaConfig?.persistency
    if (!persistency?.policies || persistency.policies.length === 0) {
      return
    }
    if (persistency.policies.includes("querystring")) {
      const values = persistFilter(persistency)
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.set(persistencyKey.value, JSON.stringify(values))
      const url = new URL(window.location.href)
      url.search = searchParams.toString()
      window.history.replaceState({}, "", url.toString())
    }
  }

  const preventWindowExit = (e: BeforeUnloadEvent) => {
    if (form.store.state.isDirty) {
      e.preventDefault()
    }
  }

  onUnmounted(persistData)

  onMounted(() => {
    window.addEventListener("beforeunload", persistData)
    window.addEventListener("blur", saveDataInUrl)
    if (omegaConfig?.preventWindowExit && omegaConfig.preventWindowExit !== "nope") {
      window.addEventListener("beforeunload", preventWindowExit)
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", persistData)
    window.removeEventListener("blur", saveDataInUrl)
    if (omegaConfig?.preventWindowExit && omegaConfig.preventWindowExit !== "nope") {
      window.removeEventListener("beforeunload", preventWindowExit)
    }
  })

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

  const handleSubmitEffect_ = (meta?: Record<string, any>) =>
    Effect.currentSpan.pipe(
      Effect.option,
      Effect
        .flatMap((span) =>
          Effect.promise(() => form.handleSubmit(Option.isSome(span) ? { currentSpan: span.value, ...meta } : meta))
        )
    )

  const handleSubmitEffect: {
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  } = (
    options?: { meta?: Record<string, any>; checkErrors?: true }
  ): any =>
    options?.checkErrors
      ? handleSubmitEffect_(options?.meta).pipe(Effect.flatMap(Effect.fnUntraced(function*() {
        const errors = form.getAllErrors()
        if (Object.keys(errors.fields).length || errors.form.errors.length) {
          return yield* new FormErrors({ form: errors.form, fields: errors.fields })
        }
      })))
      : handleSubmitEffect_(options?.meta)

  const handleSubmit = form.handleSubmit

  const fieldMap = ref(new Map<string, { label: string; id: string }>())

  const formWithExtras: OF<From, To> = Object.assign(form, {
    i18nNamespace: omegaConfig?.i18nNamespace,
    ignorePreventCloseEvents: omegaConfig?.ignorePreventCloseEvents,
    meta,
    clear,
    handleSubmit: (meta?: Record<string, any>) => {
      const span = api.trace.getSpan(api.context.active())
      return handleSubmit({ currentSpan: span, ...meta })
    },
    // /** @experimental */
    handleSubmitEffect,
    registerField: (field: ComputedRef<{ name: string; label: string; id: string }>) => {
      watch(field, (f) => fieldMap.value.set(f.name, { label: f.label, id: f.id }), { immediate: true })
      onUnmounted(() => fieldMap.value.delete(field.value.name)) // todo; perhap only when owned (id match)
    }
  })

  const errorContext = { form: formWithExtras, fieldMap }

  // Pre-bound component functions with From and To already bound
  const Input = <Name extends FieldPath<From>>(
    props: BaseProps<From, Name> & DefaultTypeProps & {
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default?(props: MergedInputProps<From, Name>): any
        label?: (props: { required: boolean; id: string; label: string }) => any
      }
      attrs?: Record<string, any>
    }
  ) => {
    const InputComponent = omegaConfig?.input ?? OmegaInput
    return h(InputComponent, {
      ...props,
      form: formWithExtras,
      ...context?.attrs
    }, context?.slots)
  }

  const Errors = (
    props?: {
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default: (props: { errors: readonly OmegaError[]; showedGeneralErrors: string[] }) => any
      }
      attrs?: Record<string, any>
    }
  ) => {
    return h(eHoc(errorContext)(OmegaErrorsInternal) as any, {
      ...props,
      ...context?.attrs
    }, context?.slots)
  }

  const TaggedUnion = <Name extends DeepKeys<From>>(
    props: {
      name: Name
      type?: "select" | "radio"
      options: import("./InputProps").TaggedUnionOptionsArray<From, Name>
      label?: string
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: Record<string, any>
      attrs?: Record<string, any>
    }
  ) => {
    return h(OmegaTaggedUnion, {
      ...props,
      form: formWithExtras as any,
      ...context?.attrs
    }, context?.slots)
  }

  const ArrayComponent = <Name extends DeepKeys<From>>(
    props: {
      name: Name
      defaultItems?: DeepValue<From, Name>
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        "pre-array"?: (props: { field: any; state: any }) => any
        default?: (props: { subField: any; subState: any; index: number; field: any }) => any
        "post-array"?: (props: { field: any; state: any }) => any
        field?: (props: { field: any }) => any
      }
      attrs?: Record<string, any>
    }
  ) => {
    return h(OmegaArray, {
      ...props,
      form: formWithExtras as any,
      ...context?.attrs
    }, context?.slots)
  }

  const AutoGen = (
    props: {
      pick?: DeepKeys<From>[]
      omit?: DeepKeys<From>[]
      labelMap?: (key: DeepKeys<From>) => string | undefined
      filterMap?: <M extends OmegaAutoGenMeta<From, To>>(key: DeepKeys<From>, meta: M) => boolean | M
      order?: DeepKeys<From>[]
      sort?: Order.Order<OmegaAutoGenMeta<From, To>>
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default(props: { child: OmegaAutoGenMeta<From, To> }): any
      }
      attrs?: Record<string, any>
    }
  ) => {
    return h(OmegaAutoGen as any, {
      ...props,
      form: formWithExtras,
      ...context?.attrs
    }, context?.slots)
  }

  const Form = <K extends keyof OmegaFormState<From, To>>(
    props: {
      disabled?: boolean
      subscribe?: K[]
      key?: string | number
      ref?: any
    },
    context?: {
      slots?: {
        default(props: {
          subscribedValues: K[] extends undefined[] ? Record<string, never> : Pick<OmegaFormState<From, To>, K>
        }): any
      }
      attrs?: Record<string, any>
    }
  ) => {
    return h(OmegaForm as any, {
      ...props,
      form: formWithExtras,
      ...context?.attrs
    }, context?.slots)
  }

  return Object.assign(formWithExtras, {
    errorContext,
    Form,
    Input,
    TaggedUnion,
    Field: form.Field,
    Errors,
    Array: ArrayComponent,
    AutoGen
  })
}
