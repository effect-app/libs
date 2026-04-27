import { Effect, Option, type Record, S } from "effect-app"
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type DeepKeys, type DeepValue, type FieldAsyncValidateOrFn, type FieldValidateOrFn, type FormApi, type FormAsyncValidateOrFn, type FormOptions, type FormState, type FormValidateOrFn, type StandardSchemaV1, type VueFormApi } from "@tanstack/vue-form"
import { isObject } from "@vueuse/core"
import type { Fiber as EffectFiber } from "effect/Fiber"
import type { Redacted } from "effect/Redacted"
import { getTransformationFrom, useIntl } from "../../utils"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type OF, type OmegaFormReturn } from "./useOmegaForm"
import type {
  BaseFieldMeta,
  BooleanFieldMeta,
  DateFieldMeta,
  FieldMeta,
  MetaRecord,
  MultipleFieldMeta,
  NestedKeyOf,
  NumberFieldMeta,
  SelectFieldMeta,
  StringFieldMeta,
  UnknownFieldMeta
} from "./meta/types"
import { warnLegacyTag } from "./meta/legacyWarning"


export const duplicateSchema = <From, To>(
  schema: S.Codec<To, From, never>
) => {
  return schema
}

const supportedInputs = [
  "button",
  "checkbox",
  "color",
  "date",
  "email",
  "number",
  "password",
  "radio",
  "range",
  "search",
  "submit",
  "tel",
  "text",
  "time",
  "url"
] as const
export type SupportedInputs = typeof supportedInputs[number]
export const getInputType = (input: string): SupportedInputs =>
  (supportedInputs as readonly string[]).includes(input) ? input as SupportedInputs : "text"

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


// === Re-exports for backward compatibility (see ./meta) ===
export {
  type BaseFieldMeta,
  type BooleanFieldMeta,
  type DateFieldMeta,
  type FieldMeta,
  type MetaRecord,
  type MultipleFieldMeta,
  type NestedKeyOf,
  type NumberFieldMeta,
  type SelectFieldMeta,
  type StringFieldMeta,
  type UnknownFieldMeta
} from "./meta/types"
export { toFormSchema } from "./meta/redacted"
export { defaultsValueFromSchema } from "./meta/defaults"
export {
  createMeta,
  generateMetaFromSchema,
  isNullableOrUndefined,
  metadataFromAst
} from "./meta/createMeta"
export type { CreateMeta, FilterItems } from "./meta/createMeta"
export {
  generateInputStandardSchemaFromFieldMeta,
  makeStandardSchemaV1Hooks,
  toLocalizedStandardSchemaV1
} from "./validation/localized"
export type {
  BaseProps,
  DefaultTypeProps,
  FieldPath,
  FieldPath_,
  FieldValidators,
  FormComponent,
  FormProps,
  FormType,
  OmegaArrayProps,
  OmegaAutoGenMeta,
  OmegaError,
  OmegaFormApi,
  OmegaFormParams,
  OmegaFormState,
  OmegaInputProps,
  OmegaInputPropsBase,
  PrefixFromDepth,
  TypeOverride,
  TypesWithOptions
} from "./types"
