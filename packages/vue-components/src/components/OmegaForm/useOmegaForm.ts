/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useForm,
  type FormValidateOrFn,
  type FormAsyncValidateOrFn,
  type StandardSchemaV1,
} from "@tanstack/vue-form"
import { S } from "effect-app"
import {
  generateMetaFromSchema,
  type NestedKeyOf,
  type FilterItems,
  type FormProps,
  type MetaRecord,
  type OmegaFormApi,
} from "./OmegaFormStuff"
import { computed, onBeforeUnmount, onMounted, onUnmounted } from "vue"

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
     * - "none": No persistency applied (takes precedence, never persists)
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: ("session" | "local" | "querystring" | "none")[]
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
      !omegaConfig?.persistency?.overrideDefaultValues ||
      omegaConfig?.persistency?.policies?.includes("none")
    ) {
      return tanstackFormOptions?.defaultValues
    }
    const persistency = omegaConfig?.persistency
    if (!persistency?.policies) return {}

    if (persistency.policies.includes("querystring")) {
      try {
        const params = new URLSearchParams(window.location.search)
        const value = params.get(persistencyKey.value)
        clearUrlParams()
        if (value) {
          return JSON.parse(value)
        }
      } catch (error) {
        console.error(error)
      }
    }

    if (
      persistency.policies.includes("local") ||
      persistency.policies.includes("session")
    ) {
      const storage = persistency.policies.includes("local")
        ? localStorage
        : sessionStorage
      if (storage) {
        try {
          const value = JSON.parse(
            storage.getItem(persistencyKey.value) || "{}",
          )
          storage.removeItem(persistencyKey.value)
          return value
        } catch (error) {
          console.error(error)
        }
      }
    }
    return {}
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
    if (
      !persistency?.policies ||
      omegaConfig?.persistency?.policies?.includes("none")
    ) {
      return
    }
    if (
      persistency.policies.includes("local") ||
      persistency.policies.includes("session")
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
    if (
      !persistency?.policies ||
      omegaConfig?.persistency?.policies?.includes("none")
    ) {
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

  const exposed = Object.assign(form, { meta, filterItems, clear })

  return exposed
}
