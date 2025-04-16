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
    method?: "session" | "local" | "none"
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

  const exposed = Object.assign(form, { meta, filterItems, clear })

  // This is fragile as fuck. It's an experiment, it's only used because
  // it's not a core feature of our products, so even if the this is not consistent
  // it's not a big deal. So not take this code as a good example of how to do things.
  // This is done only because this function is called before the component is destroyed,
  // so the state would be lost anyway. So in this case we can play with the state, without
  // worrying about the side effects.
  const persistData = () => {
    const persistency = omegaConfig?.persistency
    Match.value(persistency).pipe(
      Match.when(
        { method: method => ["local", "session"].includes(method) },
        persistency => {
          const method = persistency.method
          const storage = method === "local" ? localStorage : sessionStorage
          if (storage) {
            if (Array.isArray(persistency.keys)) {
              const subs = Object.keys(meta).filter(
                metakey => !persistency.keys?.includes(metakey as any),
              )
              subs.forEach(key => {
                form.setFieldValue(key as any, undefined)
              })
            }
            if (Array.isArray(persistency.banKeys)) {
              persistency.banKeys.forEach(key => {
                form.setFieldValue(key as any, undefined)
              })
            }
            return storage.setItem(
              persistencyKey.value,
              JSON.stringify(form.store.state.values),
            )
          }
        },
      ),
      Match.orElse(constVoid),
    )
  }

  onUnmounted(persistData)

  onMounted(() => {
    window.addEventListener("beforeunload", persistData)
  })
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", persistData)
  })

  return exposed
}
