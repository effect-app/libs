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

export interface OmegaConfig<T> {
  persistency?: {
    method?: "session" | "local" | "none"
    keys?: NestedKeyOf<T>[]
    banKeys?: NestedKeyOf<T>[]
  }
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
): OmegaFormApi<To, From> & {
  meta: MetaRecord<To>
  filterItems?: FilterItems
} => {
  if (!schema) throw new Error("Schema is required")
  const standardSchema = S.standardSchemaV1(schema)

  const { filterItems, meta } = generateMetaFromSchema(schema)

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
  }) satisfies OmegaFormApi<To, From>

  const exposed = Object.assign(form, { meta, filterItems })

  return exposed
}
