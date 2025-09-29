import type { DeepKeys } from "@tanstack/vue-form"
import { type Component, h } from "vue"
import type { InputProps } from "./InputProps"
import OmegaInput from "./OmegaInput.vue"
import { useOmegaForm } from "./useOmegaForm"

export const createUseFormWithCustomInput = (CustomInputComponent: Component) => {
  return <
    From extends Record<PropertyKey, any>,
    To extends Record<PropertyKey, any>
  >(
    ...args: Parameters<typeof useOmegaForm<From, To>>
  ) => {
    const [schema, tanstackFormOptions, omegaConfig] = args

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
            default: <TName extends DeepKeys<From>>(inputProps: InputProps<From, TName>) => {
              // If we receive inputProps from OmegaInternalInput, use our custom component
              if (inputProps && "field" in inputProps) {
                return h(CustomInputComponent, {
                  inputProps,
                  vuetifyValue: inputProps.field.state.value
                })
              }
              // Otherwise, pass through the slot content
              return slots.default?.(inputProps)
            }
          })
      }
    }

    const form = useOmegaForm<From, To>(
      schema,
      tanstackFormOptions,
      {
        ...omegaConfig,
        input: WrappedInput
      }
    )

    return form
  }
}
