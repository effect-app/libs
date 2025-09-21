/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as api from "@opentelemetry/api"
import { type DeepKeys, type FormAsyncValidateOrFn, type FormValidateOrFn, type StandardSchemaV1, StandardSchemaV1Issue, useForm, useStore } from "@tanstack/vue-form"
import { Effect, Fiber, Order, S } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import { isObject } from "effect/Predicate"
import { Component, computed, ConcreteComponent, h, type InjectionKey, onBeforeUnmount, onMounted, onUnmounted, watch } from "vue"
import { type InputProps } from "./InputProps"
import OmegaArray from "./OmegaArray.vue"
import OmegaAutoGen from "./OmegaAutoGen.vue"
import { buildOmegaErrors } from "./OmegaErrorsContext"
import OmegaErrorsInternal from "./OmegaErrorsInternal.vue"
import { DefaultInputProps, type FilterItems, type FormProps, generateMetaFromSchema, type MetaRecord, type NestedKeyOf, OmegaAutoGenMeta, OmegaError, type OmegaFormApi, OmegaFormState, ShowErrorsOn } from "./OmegaFormStuff"
import OmegaInput from "./OmegaInput.vue"
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

const fHoc = (form: OF<any, any>) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    //     return defineComponent({
    //       setup() {
    //         return {
    //           child: WrappedComponent,
    //           form
    //         }
    //       },
    //       template: `<component :is="child" v-bind="$attrs" :form="form" v-on="$listeners">
    //       <template v-for="(_, name) in $slots" #[name]="scope">
    //   <slot :name v-bind="scope ?? {}" />
    // </template>
    //     </component>`
    //     })

    return {
      render() {
        return h(WrappedComponent, {
          form,
          on: this.$listeners,
          attrs: this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

const eHoc = (errorProps: ReturnType<typeof buildOmegaErrors>) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      setup() {
        return {
          ...errorProps
        }
      },
      render({ errors, generalErrors, showErrors }: any) {
        return h(WrappedComponent, {
          errors,
          generalErrors,
          showErrors,
          on: this.$listeners,
          attrs: this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

export type OmegaConfig<T> = {
  i18nNamespace?: string
  showErrorsOn?: ShowErrorsOn

  persistency?: {
    /** Order of importance:
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: ("local" | "session" | "querystring")[]
    overrideDefaultValues?: boolean
    id?: string
  } & keysRule<T>

  input?: any
}

export interface OF<From, To> extends OmegaFormApi<From, To> {
  meta: MetaRecord<From>
  filterItems?: FilterItems
  clear: () => void
  i18nNamespace?: string
  // /** @experimental */
  // handleSubmitEffect: (meta?: Record<string, any>) => Effect.Effect<void, never, never>
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
  Props = DefaultInputProps<From>
> extends OF<From, To> {
  // this crazy thing here is copied from the OmegaFormInput.vue.d.ts, with `From` removed as Generic, instead closed over from the From generic above..
  Input: <Name extends DeepKeys<From>>(
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
            name: Name
          }
          & Props
          & Partial<{}>
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: InputProps<From, Name>): void
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
          // & {
          //   errors: readonly OmegaError[]
          //   generalErrors: (Record<string, StandardSchemaV1Issue[]> | undefined)[] | undefined
          //   showErrors: boolean
          // }
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
  Array: (
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
            pick?: DeepKeys<From>[]
            omit?: DeepKeys<From>[]
            labelMap?: (key: DeepKeys<From>) => string | undefined
            filterMap?: <M extends OmegaAutoGenMeta<From, To>>(key: DeepKeys<From>, meta: M) => boolean | M
            order?: DeepKeys<From>[]
            sort?: Order.Order<OmegaAutoGenMeta<From, To>>
          } & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          child: OmegaAutoGenMeta<From, To>
        }): void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }

  AutoGen: (
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
            pick?: DeepKeys<From>[]
            omit?: DeepKeys<From>[]
            labelMap?: (key: DeepKeys<From>) => string | undefined
            filterMap?: <M extends OmegaAutoGenMeta<From, To>>(key: DeepKeys<From>, meta: M) => boolean | M
            order?: DeepKeys<From>[]
            sort?: Order.Order<OmegaAutoGenMeta<From, To>>
          } & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          child: OmegaAutoGenMeta<From, To>
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

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
  Props = DefaultInputProps<From>
>(
  schema: S.Schema<To, From, never>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To, Props> => {
  if (!schema) throw new Error("Schema is required")
  const standardSchema = S.standardSchemaV1(schema)
  const decode = S.decode(schema)

  const { filterItems, meta } = generateMetaFromSchema(schema)

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

  const defaultValues = computed(() => {
    if (
      tanstackFormOptions?.defaultValues
      && !omegaConfig?.persistency?.overrideDefaultValues
    ) {
      // defaultValues from tanstack are not partial,
      // so if ovverrideDefaultValues is false we simply return them
      return tanstackFormOptions?.defaultValues
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

    if (tanstackFormOptions?.defaultValues == undefined) {
      // we just return what we gathered from the query/storage
      return defValuesPatch
    } else {
      const startingDefValues = tanstackFormOptions?.defaultValues
      return deepMerge(startingDefValues, defValuesPatch)
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

  onUnmounted(persistData)

  onMounted(() => {
    window.addEventListener("beforeunload", persistData)
    window.addEventListener("blur", saveDataInUrl)
  })
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", persistData)
    window.removeEventListener("blur", saveDataInUrl)
  })

  const handleSubmit = form.handleSubmit
  const formWithExtras: OF<From, To> = Object.assign(form, {
    i18nNamespace: omegaConfig?.i18nNamespace,
    meta,
    filterItems,
    clear,
    handleSubmit: (meta?: Record<string, any>) => {
      const span = api.trace.getSpan(api.context.active())
      return handleSubmit({ currentSpan: span, ...meta })
    }
    // /** @experimental */
    // handleSubmitEffect: (meta?: Record<string, any>) =>
    //   Effect.currentSpan.pipe(
    //     Effect.option,
    //     Effect
    //       .flatMap((span) =>
    //         Effect.promise(() => form.handleSubmit(Option.isSome(span) ? { currentSpan: span.value, ...meta } : meta))
    //       )
    //   )
  })

  const formSubmissionAttempts = useStore(
    formWithExtras.store,
    (state) => state.submissionAttempts
  )

  const errors = formWithExtras.useStore((state) => state.errors)

  watch(
    () => [formWithExtras.filterItems, errors.value],
    () => {
      const filterItems: FilterItems | undefined = formWithExtras.filterItems
      const currentErrors = errors.value
      if (!filterItems) return {}
      if (!currentErrors) return {}
      const errorList = Object
        .values(currentErrors)
        .filter(
          (fieldErrors): fieldErrors is Record<string, StandardSchemaV1Issue[]> => Boolean(fieldErrors)
        )
        .flatMap((fieldErrors) =>
          Object
            .values(fieldErrors)
            .flat()
            .map((issue: StandardSchemaV1Issue) => issue.message)
        )

      if (errorList.some((e) => e === filterItems.message)) {
        // TODO: Investigate if filterItems.items should be typed based on DeepKeys<To>.
        filterItems.items.forEach((item: keyof From) => {
          const m = formWithExtras.getFieldMeta(item as any)
          if (m) {
            formWithExtras.setFieldMeta(item as any, {
              ...m,
              errorMap: {
                onSubmit: [
                  { path: [item as string], message: filterItems.message }
                ]
              }
            })
          }
        })
      }
      return {}
    }
  )

  //  provide(OmegaFormKey, formWithExtras)
  const errorContext = buildOmegaErrors(formSubmissionAttempts, errors, omegaConfig?.showErrorsOn)

  return Object.assign(formWithExtras, {
    errorContext,
    Form: fHoc(formWithExtras)(OmegaForm as any) as any,
    Input: fHoc(formWithExtras)(omegaConfig?.input ?? OmegaInput) as any,
    Field: form.Field,
    Errors: eHoc(errorContext)(OmegaErrorsInternal) as any,
    Array: fHoc(formWithExtras)(OmegaArray) as any,
    AutoGen: fHoc(formWithExtras)(OmegaAutoGen as any) as any
  })
}
