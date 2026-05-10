import type * as S from "effect-app/Schema"

export { getInputType, type SupportedInputs } from "./inputs"
export { createMeta, generateMetaFromSchema, isNullableOrUndefined, metadataFromAst } from "./meta/createMeta"
export type { CreateMeta, FilterItems } from "./meta/createMeta"
export { defaultsValueFromSchema } from "./meta/defaults"
export { toFormSchema } from "./meta/redacted"
export type { BaseFieldMeta, BooleanFieldMeta, DateFieldMeta, FieldMeta, MetaRecord, MultipleFieldMeta, NestedKeyOf, NumberFieldMeta, SelectFieldMeta, StringFieldMeta, UnknownFieldMeta } from "./meta/types"
export { deepMerge } from "./persistency"
export type { BaseProps, DefaultTypeProps, FieldPath, FieldPath_, FieldValidators, FormComponent, FormProps, FormType, OmegaArrayProps, OmegaAutoGenMeta, OmegaError, OmegaFormApi, OmegaFormParams, OmegaFormState, OmegaInputProps, OmegaInputPropsBase, PrefixFromDepth, TypeOverride, TypesWithOptions } from "./types"
export { makeStandardSchemaV1Hooks, toLocalizedStandardSchemaV1 } from "./validation/localized"

export { FormErrors, OmegaFormKey, useErrorLabel, useOmegaForm } from "./useOmegaForm"
export type { defaultValuesPriorityUnion, OF, OmegaConfig, OmegaFormReturn, Policies } from "./useOmegaForm"

export { type ExtractTagValue, type ExtractUnionBranch, type InputProps, type MergedInputProps, type TaggedUnionOption, type TaggedUnionOptionsArray, type TaggedUnionProps } from "./InputProps"
export { default as OmegaInput } from "./OmegaInput.vue"
export { default as OmegaVuetifyInput } from "./OmegaInternalInput.vue"
export { default as OmegaTaggedUnion } from "./OmegaTaggedUnion.vue"
export { default as OmegaTaggedUnionInternal } from "./OmegaTaggedUnionInternal.vue"

export { useOnClose, usePreventClose } from "./blockDialog"

export { createUseFormWithCustomInput } from "./createUseFormWithCustomInput"

export const duplicateSchema = <From, To>(schema: S.Codec<To, From>) => schema
