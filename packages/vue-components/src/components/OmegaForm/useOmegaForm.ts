/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { type DeepKeys, type DeepValue, type FormAsyncValidateOrFn, type FormValidateOrFn, revalidateLogic, type StandardSchemaV1, useForm } from "@tanstack/vue-form"
import * as Context from "effect-app/Context"
import * as S from "effect-app/Schema"
import { type InjectionKey, watch } from "vue"
import { eHoc, makeFieldMap } from "./errors"
import { fHoc } from "./hocs"
import { generateMetaFromSchema, unwrapDeclaration } from "./meta/createMeta"
import { defaultsValueFromSchema, fillNestedDefaults } from "./meta/defaults"
import { toFormSchema } from "./meta/redacted"
import OmegaArray from "./OmegaArray.vue"
import OmegaAutoGen from "./OmegaAutoGen.vue"
import OmegaErrorsInternal from "./OmegaErrorsInternal.vue"
import OmegaInput from "./OmegaInput.vue"
import OmegaTaggedUnion from "./OmegaTaggedUnion.vue"
import OmegaForm from "./OmegaWrapper.vue"
import { usePersistency } from "./persistency"
import { makeSubmitHandlers, wrapOnSubmit } from "./submit"
import type { DefaultTypeProps, FormProps, OF, OmegaConfig, OmegaFormApi, OmegaFormReturn } from "./types"
import { annotateLiteralUnionMessages, toLocalizedStandardSchemaV1 } from "./validation/localized"

import { makeRunPromise } from "@effect-app/vue/runtime"
import { useIntl } from "../../utils"

export { useErrorLabel } from "./errors"
export { FormErrors } from "./submit"
export type { defaultValuesPriorityUnion, OF, OmegaConfig, OmegaFormReturn, Policies } from "./types"

export const OmegaFormKey = Symbol("OmegaForm") as InjectionKey<OF<any, any>>

const runPromise = makeRunPromise(Context.empty())

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
>(
  schema: S.Codec<To, From>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To, TypeProps> => {
  if (!schema) throw new Error("Schema is required")
  const { trans } = useIntl()
  const formCompatibleSchema = toFormSchema(schema)
  // Effect's Standard Schema formatter emits `Expected X | Y, got Z` for
  // `AnyOf` issues without consulting our hooks. Pre-annotate literal-union
  // (select) and literal-array (multiple) AST nodes with a localized
  // `message` so the formatter picks them up via `findMessage`.
  const localizedSchema = annotateLiteralUnionMessages(formCompatibleSchema, trans)

  // A nullable struct (`S.NullOr(S.Struct(...))`) has no slot in the form
  // value until a child is filled. Once it materialises, its untouched
  // children are still `undefined` — which strict `S.NullOr(...)` children
  // reject. Deep-fill those children with their defaults before both
  // validation and decoding so they validate as `null` (or their default).
  const formAst = unwrapDeclaration(formCompatibleSchema.ast)
  const normalizeFormValue = (value: unknown) => fillNestedDefaults(formAst, value)

  const baseStandardSchema = toLocalizedStandardSchemaV1(
    localizedSchema as any,
    trans
  )
  const standardSchema: typeof baseStandardSchema = {
    ...baseStandardSchema,
    "~standard": {
      ...baseStandardSchema["~standard"],
      validate: (value) => baseStandardSchema["~standard"].validate(normalizeFormValue(value))
    }
  }

  const baseDecode = S.decodeUnknownEffectConcurrently(formCompatibleSchema)
  const decode = (value: From) => baseDecode(normalizeFormValue(value))

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
    validationLogic: revalidateLogic(),
    validators: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onDynamic: standardSchema as any,
      ...tanstackFormOptions?.validators
    },
    onSubmit: wrapOnSubmit<From, To>(tanstackFormOptions?.onSubmit, decode, runPromise),
    defaultValues: persistency.defaultValues.value
  }) satisfies OmegaFormApi<To, From>
  formHolder.form = form

  // Keep the live form state consistent with the schema: when a nullable
  // struct materialises (a child got a value), backfill its untouched
  // children so `values` reflects what is validated and submitted. Called
  // from the field change handler — the only point a struct can materialise.
  const normalizeNullableStructs = () => {
    const current = form.state.values
    const filled = fillNestedDefaults(formAst, current)
    if (filled === current || !filled || typeof filled !== "object") return
    const currentRecord = current as Partial<Record<Extract<keyof From, string>, unknown>>
    const filledRecord = filled as Partial<Record<Extract<keyof From, string>, unknown>>
    for (const key of Object.keys(filledRecord) as Array<Extract<keyof From, string>>) {
      if (filledRecord[key] !== currentRecord[key]) {
        const field = key as DeepKeys<From>
        form.setFieldValue(field, filledRecord[key] as DeepValue<From, typeof field>, {
          dontUpdateMeta: true,
          dontValidate: true
        })
      }
    }
  }

  const clear = () => {
    Object.keys(meta).forEach((key: any) => {
      form.setFieldValue(key, undefined as any)
    })
  }

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
    normalizeNullableStructs,
    handleSubmit,
    // /** @experimental */
    handleSubmitEffect,
    registerField
  })

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
