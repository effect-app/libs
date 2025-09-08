/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as api from "@opentelemetry/api"
import { type DeepKeys, type FormAsyncValidateOrFn, type FormValidateOrFn, type StandardSchemaV1, useForm } from "@tanstack/vue-form"
import { Effect, Fiber, S } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import { isObject } from "effect/Predicate"
import { computed, type InjectionKey, onBeforeUnmount, onMounted, onUnmounted, provide } from "vue"
import { type InputProps } from "./InputProps"
import OmegaFormInput from "./OmegaFormInput.vue"
import { type FieldValidators, type FilterItems, type FormProps, generateMetaFromSchema, type MetaRecord, type NestedKeyOf, type OmegaFormApi, type TypeOverride } from "./OmegaFormStuff"

type keysRule<T> =
  | {
    keys?: NestedKeyOf<T>[]
    banKeys?: "You should only use one of banKeys or keys, not both, moron"
  }
  | {
    keys?: "You should only use one of banKeys or keys, not both, moron"
    banKeys?: NestedKeyOf<T>[]
  }

export type OmegaConfig<T> = {
  persistency?: {
    /** Order of importance:
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: ("local" | "session" | "querystring")[]
    overrideDefaultValues?: boolean
    id?: string
  } & keysRule<T>
}

interface OF<From, To> extends OmegaFormApi<From, To> {
  meta: MetaRecord<From>
  filterItems?: FilterItems
  clear: () => void
  // /** @experimental */
  // handleSubmitEffect: (meta?: Record<string, any>) => Effect.Effect<void, never, never>
}

export const OmegaFormKey = Symbol("OmegaForm") as InjectionKey<OF<any, any>>

type __VLS_PrettifyLocal<T> =
  & {
    [K in keyof T]: T[K]
  }
  & {}

export interface OmegaFormReturn<From extends Record<PropertyKey, any>, To extends Record<PropertyKey, any>>
  extends OF<From, To>
{
  // this crazy thing here is copied from the OmegaFormInput.vue.d.ts, with `From` removed as Generic, instead closed over from the From generic above..
  Input: <Name extends DeepKeys<From>>(
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
            name: Name
            label: string
            validators?: FieldValidators<From>
            options?: {
              title: string
              value: string
            }[]
            type?: TypeOverride
          } & Partial<{}>
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
}

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>
>(
  schema: S.Schema<To, From, never>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To> => {
  if (!schema) throw new Error("Schema is required")
  const standardSchema = S.standardSchemaV1(schema)

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
          const r = tanstackFormOptions.onSubmit!({
            formApi: formApi as OmegaFormApi<From, To>,
            meta,
            value: value as unknown as To
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
    meta,
    filterItems,
    clear,
    handleSubmit: () => {
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

  provide(OmegaFormKey, formWithExtras)

  return Object.assign(formWithExtras, {
    Input: OmegaFormInput,
    Field: form.Field
  })
}
