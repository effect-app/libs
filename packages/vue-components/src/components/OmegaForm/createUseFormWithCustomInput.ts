import type { DeepKeys } from "@tanstack/vue-form"
import { type Component, h } from "vue"
import type { MergedInputProps } from "./InputProps"
import { type DefaultTypeProps } from "./OmegaFormStuff"
import OmegaInput from "./OmegaInput.vue"
import { useOmegaForm } from "./useOmegaForm"

export const createUseFormWithCustomInput = <
  TypeProps = DefaultTypeProps
>(CustomInputComponent: Component) => {
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
      setup(props: any, { attrs }: any) {
        return () =>
          h(OmegaInput, {
            ...props,
            ...attrs
          }, {
            // Override the default slot that OmegaInternalInput provides
            default: <TName extends DeepKeys<From>>({ field, ...inputProps }: MergedInputProps<From, TName>) => {
              return h(CustomInputComponent, { field, inputProps })
            }
          })
      }
    }

    const form = useOmegaForm<From, To, TypeProps>(
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
