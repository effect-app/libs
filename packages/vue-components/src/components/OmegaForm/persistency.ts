/* eslint-disable @typescript-eslint/no-explicit-any */
import { isObject } from "@vueuse/core"
import { Array } from "effect-app"
import { computed, type ComputedRef, onBeforeUnmount, onMounted, onUnmounted } from "vue"
import { type MetaRecord } from "./meta/types"

export type Policies = "local" | "session" | "querystring"
export type DefaultValuesPriorityUnion = "tanstack" | "persistency" | "schema"

// Backward-compatible alias for the legacy lowercased-prefix type name.
export type defaultValuesPriorityUnion = DefaultValuesPriorityUnion

export interface PersistencyConfig {
  /** Order of importance:
   * - "querystring": Highest priority when persisting
   * - "local" and then "session": Lower priority storage options
   */
  policies?: ReadonlyArray<Policies>
  overrideDefaultValues?: "deprecated: use defaultValuesPriority"
  id?: string
  keys?: ReadonlyArray<string> | "You should only use one of banKeys or keys, not both, moron"
  banKeys?: ReadonlyArray<string> | "You should only use one of banKeys or keys, not both, moron"
}

export function deepMerge(target: any, source: any) {
  const result = { ...target }
  for (const key in source) {
    if (Array.isArray(source[key])) {
      // Arrays should be copied directly, not deep merged
      result[key] = source[key]
    } else if (source[key] && isObject(source[key])) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

const includesPolicy = (arr: ReadonlyArray<Policies>, policy: Policies) => {
  return arr.includes(policy)
}

export interface UsePersistencyOptions<From> {
  meta: MetaRecord<From>
  persistency?: PersistencyConfig
  preventWindowExit?: "prevent" | "prevent-and-reset" | "nope"
  defaultValuesPriority?: DefaultValuesPriorityUnion[] | readonly DefaultValuesPriorityUnion[]
  /** Tanstack-provided default values (highest priority by default). */
  tanstackDefaultValues?: any
  /** Lazy schema-derived defaults factory. */
  schemaDefaultValues: () => any
  /**
   * Lazy accessor for the form. Lazy because persistency is created BEFORE
   * the form (its `defaultValues` are passed into `useForm`), but the
   * persistence callbacks (`persistData`, `saveDataInUrl`, the
   * `beforeunload` listener) only run later and need the live form.
   */
  getForm: () => {
    store: { state: { values: any; isDirty: boolean } }
    getFieldValue: (path: any) => any
  }
}

export interface UsePersistencyReturn {
  defaultValues: ComputedRef<any>
  persistencyKey: ComputedRef<string>
  persistData: () => void
  saveDataInUrl: () => void
  clearUrlParams: () => void
}

/**
 * Encapsulates form-data persistency: loading default values from
 * localStorage / sessionStorage / querystring, persisting them on unmount
 * or window blur, and the optional `preventWindowExit` warning listener.
 *
 * The `prevent-and-reset` reset-on-success behavior is intentionally NOT
 * owned here — the consumer wires that to its own form submit lifecycle.
 */
export const usePersistency = <From>(opts: UsePersistencyOptions<From>): UsePersistencyReturn => {
  const { getForm, meta, persistency, preventWindowExit, schemaDefaultValues, tanstackDefaultValues } = opts

  const persistencyKey = computed(() => {
    if (persistency?.id) {
      return persistency.id
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
    // will contain what we get from querystring or local/session storage
    let persistencyDefaultValues

    if (
      // query string has higher priority than local/session storage
      persistency?.policies
      && !persistencyDefaultValues
      && (includesPolicy(persistency.policies, "local")
        || includesPolicy(persistency.policies, "session"))
    ) {
      const storage = includesPolicy(persistency.policies, "local")
        ? localStorage
        : sessionStorage
      if (storage) {
        try {
          const value = JSON.parse(
            storage.getItem(persistencyKey.value) || "{}"
          )
          storage.removeItem(persistencyKey.value)
          persistencyDefaultValues = value
        } catch (error) {
          console.error(error)
        }
      }
    }
    if (persistency?.policies && includesPolicy(persistency.policies, "querystring")) {
      try {
        const params = new URLSearchParams(window.location.search)
        const value = params.get(persistencyKey.value)
        clearUrlParams()
        if (value) {
          persistencyDefaultValues = deepMerge(persistencyDefaultValues || {}, JSON.parse(value))
        }
      } catch (error) {
        console.error(error)
      }
    }

    // to be sure we have a valid object at the end of the gathering process
    persistencyDefaultValues ??= {}

    const defaults: Record<DefaultValuesPriorityUnion, any> = {
      tanstack: tanstackDefaultValues || {},
      persistency: persistencyDefaultValues,
      schema: schemaDefaultValues()
    }

    return [...(opts.defaultValuesPriority || ["tanstack", "persistency", "schema"] as const)].reverse().reduce(
      (acc: any, m: DefaultValuesPriorityUnion) => {
        if (!Object.keys(acc).length) {
          return defaults[m]
        }
        return deepMerge(acc, defaults[m])
      },
      {}
    )
  })

  const createNestedObjectFromPaths = (paths: string[]) =>
    paths.reduce((result, path) => {
      const parts = path.split(".")
      parts.reduce((acc, part, i) => {
        if (i === parts.length - 1) {
          acc[part] = getForm().getFieldValue(path as any)
        } else {
          acc[part] = acc[part] ?? {}
        }
        return acc[part]
      }, result)
      return result
    }, {} as Record<string, any>)

  const persistFilter = (p: PersistencyConfig | undefined) => {
    if (!p) return
    const { banKeys, keys } = p
    if (Array.isArray(keys)) {
      return createNestedObjectFromPaths(keys as string[])
    }
    if (Array.isArray(banKeys)) {
      const subs = Object.keys(meta).filter((metakey) => banKeys.includes(metakey))
      return createNestedObjectFromPaths(subs)
    }
    return getForm().store.state.values
  }

  const persistData = () => {
    if (!persistency?.policies || persistency.policies.length === 0) {
      return
    }
    if (
      includesPolicy(persistency.policies, "local")
      || includesPolicy(persistency.policies, "session")
    ) {
      const storage = includesPolicy(persistency.policies, "local")
        ? localStorage
        : sessionStorage
      if (!storage) return
      const values = persistFilter(persistency)
      return storage.setItem(persistencyKey.value, JSON.stringify(values))
    }
  }

  const saveDataInUrl = () => {
    if (!persistency?.policies || persistency.policies.length === 0) {
      return
    }
    if (includesPolicy(persistency.policies, "querystring")) {
      const values = persistFilter(persistency)
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.set(persistencyKey.value, JSON.stringify(values))
      const url = new URL(window.location.href)
      url.search = searchParams.toString()
      window.history.replaceState({}, "", url.toString())
    }
  }

  const preventWindowExitListener = (e: BeforeUnloadEvent) => {
    if (getForm().store.state.isDirty) {
      e.preventDefault()
    }
  }

  onUnmounted(persistData)

  onMounted(() => {
    window.addEventListener("beforeunload", persistData)
    window.addEventListener("blur", saveDataInUrl)
    if (preventWindowExit && preventWindowExit !== "nope") {
      window.addEventListener("beforeunload", preventWindowExitListener)
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", persistData)
    window.removeEventListener("blur", saveDataInUrl)
    if (preventWindowExit && preventWindowExit !== "nope") {
      window.removeEventListener("beforeunload", preventWindowExitListener)
    }
  })

  return {
    defaultValues,
    persistencyKey,
    persistData,
    saveDataInUrl,
    clearUrlParams
  }
}
