/* eslint-disable @typescript-eslint/no-explicit-any -- TanStack Form / Vue render-fn slot interop */
import type { DeepKeys } from "@tanstack/vue-form"
import { type Component, h } from "vue"
import type { MergedInputProps } from "./InputProps"
import OmegaInput from "./OmegaInput.vue"
import type { OmegaConfig } from "./types"
import { useOmegaForm } from "./useOmegaForm"

export const createUseFormWithCustomInput = (CustomInputComponent: Component) => {
  return <
    From extends Record<PropertyKey, any>,
    To extends Record<PropertyKey, any>,
    const Cfg extends OmegaConfig<To> = OmegaConfig<To>
  >(
    schema: Parameters<typeof useOmegaForm<From, To>>[0],
    tanstackFormOptions?: Parameters<typeof useOmegaForm<From, To>>[1],
    omegaConfig?: Cfg
  ) => {
    // Create a wrapper that extends OmegaInput and overrides its default slot
    const WrappedInput = {
      name: "WrappedInput",
      inheritAttrs: false,
      setup(props: any, { attrs, slots }: any) {
        return () =>
          h(OmegaInput, {
            ...props,
            ...attrs
          }, {
            // Override the default slot that OmegaInternalInput provides
            default: <TName extends DeepKeys<From>>({ field, state, ...inputProps }: MergedInputProps<From, TName>) => {
              // Filter out attrs that are already in inputProps or are special  like 'form'
              const filteredAttrs = Object.fromEntries(
                Object.entries(attrs).filter(([key]) =>
                  !Object.prototype.hasOwnProperty.call(inputProps, key)
                  && key !== "form"
                )
              )
              // A per-type registration (omegaConfig.inputs) wins over the
              // universal CustomInputComponent; otherwise fall back to it.
              const LeafComponent = omegaConfig?.inputs?.[inputProps.type] ?? CustomInputComponent
              return h(LeafComponent, { ...filteredAttrs, field, state, inputProps }, {
                // Pass through label slot if it exists
                ...(slots.label && {
                  label: (labelProps: any) => slots.label(labelProps)
                }),
                // Pass through default slot if it exists
                ...(slots.default && {
                  default: (slotProps: any) => slots.default(slotProps)
                })
              })
            },
            // Pass through label slot to OmegaInput
            ...(slots.label && {
              label: (labelProps: any) => slots.label(labelProps)
            })
          })
      }
    }

    // Thread `Cfg` so `omegaConfig.inputs` keys are inferred into the `type`
    // union (`<form.Input type="...">`), exactly like a bare `useOmegaForm`.
    const form = useOmegaForm<From, To, Cfg>(
      schema,
      tanstackFormOptions,
      { ...omegaConfig, input: WrappedInput } as Cfg
    )

    return form
  }
}
