/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useForm,
  type FormValidateOrFn,
  type FormAsyncValidateOrFn,
  type StandardSchemaV1,
} from "@tanstack/vue-form"
import { Match, S } from "effect-app"
import {
  generateMetaFromSchema,
  type NestedKeyOf,
  type FilterItems,
  type FormProps,
  type MetaRecord,
  type OmegaFormApi,
} from "./OmegaFormStuff"
import { computed, onBeforeUnmount, onMounted, onUnmounted } from "vue"
import { constVoid } from "effect/Function"

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
    method?: "session" | "local" | "querystring" | "none"
    overrideDefaultValues?: boolean
    id?: string
  } & keysRule<T>
}

export interface OmegaFormReturn<To, From> extends OmegaFormApi<To, From> {
  meta: MetaRecord<To>
  filterItems?: FilterItems
  clear: () => void
}

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
>(
  schema: S.Schema<From, To, never>,
  tanstackFormOptions?: NoInfer<FormProps<To, From>>,
  omegaConfig?: OmegaConfig<From>,
): OmegaFormReturn<To, From> => {
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

  const defaultValues = computed(() => {
    if (
      tanstackFormOptions?.defaultValues &&
      !omegaConfig?.persistency?.overrideDefaultValues
    )
      return tanstackFormOptions.defaultValues
    const persistency = omegaConfig?.persistency
    return Match.value(persistency).pipe(
      Match.when(
        { method: method => ["local", "session"].includes(method) },
        persistency => {
          const method = persistency.method
          const storage = method === "local" ? localStorage : sessionStorage
          if (storage) {
            try {
              const value = JSON.parse(
                storage.getItem(persistencyKey.value) || "{}",
              )
              storage.removeItem(persistencyKey.value)
              return value
            } catch (error) {
              console.error(error)
              return {}
            }
          }
          return {}
        },
      ),
      Match.when({ method: "querystring" }, () => {
        try {
          const params = new URLSearchParams(window.location.search)
          const value = params.get(persistencyKey.value)
          clearUrlParams()
          if (value) {
            return JSON.parse(value)
          }
          return {}
        } catch (error) {
          console.error(error)
          return {}
        }
      }),
      Match.orElse(() => ({})),
    )
  })

  const form = useForm<
    To,
    FormValidateOrFn<To> | undefined,
    FormValidateOrFn<To> | undefined,
    StandardSchemaV1<To, From>,
    FormValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined
  >({
    ...tanstackFormOptions,
    validators: {
      onSubmit: standardSchema,
      ...(tanstackFormOptions?.validators || {}),
    },
    onSubmit: tanstackFormOptions?.onSubmit
      ? ({ formApi, meta, value }) =>
          tanstackFormOptions.onSubmit?.({
            formApi: formApi as OmegaFormApi<To, From>,
            meta,
            value: value as unknown as From,
          })
      : undefined,
    defaultValues: defaultValues.value as any,
  }) satisfies OmegaFormApi<To, From>

  const clear = () => {
    Object.keys(meta).forEach((key: any) => {
      form.setFieldValue(key, undefined)
    })
  }

  function createNestedObjectFromPaths(paths: string[]) {
    return paths.reduce(
      (result, path) => {
        const parts = path.split(".")
        parts.reduce((acc, part, i) => {
          if (i === parts.length - 1) {
            acc[part] = form.getFieldValue(path as any)
          } else {
            acc[part] = acc[part] || {}
          }
          return acc[part]
        }, result)
        return result
      },
      {} as Record<string, any>,
    )
  }

  const persistFilter = (persistency: OmegaConfig<From>["persistency"]) => {
    if (!persistency) return
    if (Array.isArray(persistency.keys)) {
      return createNestedObjectFromPaths(persistency.keys)
    }
    if (Array.isArray(persistency.banKeys)) {
      const subs = Object.keys(meta).filter(metakey =>
        persistency.banKeys?.includes(metakey as any),
      )
      return createNestedObjectFromPaths(subs)
    }
    return {}
  }

  const persistData = () => {
    const persistency = omegaConfig?.persistency
    Match.value(persistency).pipe(
      Match.when(
        { method: method => ["local", "session"].includes(method) },
        persistency => {
          const method = persistency.method
          const storage = method === "local" ? localStorage : sessionStorage
          if (!storage) return
          const values = persistFilter(persistency)
          return storage.setItem(persistencyKey.value, JSON.stringify(values))
        },
      ),
      Match.orElse(constVoid),
    )
  }

  const saveDataInUrl = () => {
    Match.value(omegaConfig?.persistency).pipe(
      Match.when({ method: "querystring" }, persistency => {
        const values = persistFilter(persistency)
        console.log("values", values)
        const searchParams = new URLSearchParams(window.location.search)
        searchParams.set(persistencyKey.value, JSON.stringify(values))
        const url = new URL(window.location.href)
        url.search = searchParams.toString()
        window.history.replaceState({}, "", url.toString())
      }),
      Match.orElse(constVoid),
    )
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

  const exposed = Object.assign(form, { meta, filterItems, clear })

  return exposed
}
