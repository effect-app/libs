/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as api from "@opentelemetry/api"
import { type DeepKeys, DeepValue, type FormAsyncValidateOrFn, type FormValidateOrFn, type StandardSchemaV1, StandardSchemaV1Issue, useForm, ValidationError, ValidationErrorMap } from "@tanstack/vue-form"
import { Array, Data, Effect, Fiber, Option, Order, S } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import { isObject } from "effect/Predicate"
import { Component, computed, ComputedRef, ConcreteComponent, h, type InjectionKey, onBeforeUnmount, onMounted, onUnmounted, Ref, ref, watch } from "vue"
import { MergedInputProps } from "./InputProps"
import OmegaArray from "./OmegaArray.vue"
import OmegaAutoGen from "./OmegaAutoGen.vue"
import OmegaErrorsInternal from "./OmegaErrorsInternal.vue"
import { BaseProps, DefaultTypeProps, type FormProps, generateMetaFromSchema, type MetaRecord, type NestedKeyOf, OmegaArrayProps, OmegaAutoGenMeta, OmegaError, type OmegaFormApi, OmegaFormState } from "./OmegaFormStuff"
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

export class FormErrors<From> extends Data.TaggedError("FormErrors")<{
  form: {
    // TODO: error shapes seem off, with `undefined` etc..
    errors: (Record<string, StandardSchemaV1Issue[]> | undefined)[]
    errorMap: ValidationErrorMap<
      undefined,
      undefined,
      Record<string, StandardSchemaV1Issue[]>,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >
  }
  fields: Record<DeepKeys<From>, {
    errors: ValidationError[]
    errorMap: ValidationErrorMap
  }>
}> {}

const fHoc = (form: OF<any, any>) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      render() {
        return h(WrappedComponent, {
          form,
          ...this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

const eHoc = (errorProps: {
  form: OF<any, any>
  fieldMap: Ref<Map<string, { id: string; label: string }>>
}) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      setup() {
        const { fieldMap, form } = errorProps
        const generalErrors = form.useStore((state) => state.errors)
        const fieldMeta = form.useStore((state) => state.fieldMeta)
        const errors = computed(() =>
          Array.filterMap(
            Object
              .entries(fieldMeta.value),
            ([key, m]): Option.Option<OmegaError> =>
              ((m as any).errors ?? []).length && fieldMap.value.get(key)?.id
                ? Option.some({
                  label: fieldMap.value.get(key)!.label,
                  inputId: fieldMap.value.get(key)!.id,
                  errors: ((m as any).errors ?? []).map((e: any) => e.message).filter(Boolean)
                })
                : Option.none()
          )
        )

        return {
          generalErrors,
          errors
        }
      },
      render({ errors, generalErrors }: any) {
        return h(WrappedComponent, {
          errors,
          generalErrors,
          ...this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

export type OmegaConfig<T> = {
  i18nNamespace?: string

  persistency?: {
    /** Order of importance:
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: ("local" | "session" | "querystring")[]
    overrideDefaultValues?: boolean
    id?: string
  } & keysRule<T>

  ignorePreventCloseEvents?: boolean

  input?: any
}

export interface OF<From, To> extends OmegaFormApi<From, To> {
  meta: MetaRecord<From>
  clear: () => void
  i18nNamespace?: string
  ignorePreventCloseEvents?: boolean
  registerField: (
    field: ComputedRef<{
      name: string
      label: string
      id: string
    }>
  ) => void
  /** @experimental */
  handleSubmitEffect: {
    /**
     * when `checkErrors` is true, the Effect will fail with `FormErrors<From>` when there are validation errors
     * @experimental */
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    /** @experimental */
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  }
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
  TypeProps = DefaultTypeProps
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
          & BaseProps<From, Name>
          & TypeProps
          & Partial<{}>
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: MergedInputProps<From, Name>): void
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
          & Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & (Omit<OmegaArrayProps<From, To>, "form">)
          & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        "pre-array"?: (props: {
          field: import("@tanstack/vue-form").FieldApi<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            Record<string, any> | undefined
          >
          state: import("@tanstack/vue-form").FieldState<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined
          >
        }) => any
      } & {
        default?: (props: {
          subField: import("@tanstack/vue-form").FieldApi<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            Record<string, any> | undefined
          >
          subState: import("@tanstack/vue-form").FieldState<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined
          >
          index: number
          field: import("@tanstack/vue-form").FieldApi<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            Record<string, any> | undefined
          >
        }) => any
      } & {
        "post-array"?: (props: {
          field: import("@tanstack/vue-form").FieldApi<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            Record<string, any> | undefined
          >
          state: import("@tanstack/vue-form").FieldState<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined
          >
        }) => any
      } & {
        field?: (props: {
          field: import("@tanstack/vue-form").FieldApi<
            From,
            DeepKeys<From>,
            DeepValue<From, DeepKeys<From>>,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            | import("@tanstack/vue-form").FieldAsyncValidateOrFn<From, DeepKeys<From>, DeepValue<From, DeepKeys<From>>>
            | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").StandardSchemaV1<From, To>,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
            Record<string, any> | undefined
          >
        }) => any
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
  TypeProps = DefaultTypeProps
>(
  schema: S.Schema<To, From, never>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To, TypeProps> => {
  if (!schema) throw new Error("Schema is required")
  const standardSchema = S.standardSchemaV1(schema)
  const decode = S.decode(schema)

  const { meta } = generateMetaFromSchema(schema)

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

  const handleSubmitEffect_ = (meta?: Record<string, any>) =>
    Effect.currentSpan.pipe(
      Effect.option,
      Effect
        .flatMap((span) =>
          Effect.promise(() => form.handleSubmit(Option.isSome(span) ? { currentSpan: span.value, ...meta } : meta))
        )
    )

  const handleSubmitEffect: {
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  } = (
    options?: { meta?: Record<string, any>; checkErrors?: true }
  ): any =>
    options?.checkErrors
      ? handleSubmitEffect_(options?.meta).pipe(Effect.flatMap(Effect.fnUntraced(function*() {
        const errors = form.getAllErrors()
        if (Object.keys(errors.fields).length || errors.form.errors.length) {
          return yield* new FormErrors({ form: errors.form, fields: errors.fields })
        }
      })))
      : handleSubmitEffect_(options?.meta)

  const handleSubmit = form.handleSubmit

  const fieldMap = ref(new Map<string, { label: string; id: string }>())

  const formWithExtras: OF<From, To> = Object.assign(form, {
    i18nNamespace: omegaConfig?.i18nNamespace,
    ignorePreventCloseEvents: omegaConfig?.ignorePreventCloseEvents,
    meta,
    clear,
    handleSubmit: (meta?: Record<string, any>) => {
      const span = api.trace.getSpan(api.context.active())
      return handleSubmit({ currentSpan: span, ...meta })
    },
    // /** @experimental */
    handleSubmitEffect,
    registerField: (field: ComputedRef<{ name: string; label: string; id: string }>) => {
      watch(field, (f) => fieldMap.value.set(f.name, { label: f.label, id: f.id }), { immediate: true })
      onUnmounted(() => fieldMap.value.delete(field.value.name)) // todo; perhap only when owned (id match)
    }
  })

  const errorContext = { form: formWithExtras, fieldMap }

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
