/* eslint-disable @typescript-eslint/no-explicit-any */

import { type Component, type ConcreteComponent, h } from "vue"
import type { OF } from "./useOmegaForm"

export const fHoc = (form: OF<any, any>) => {
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
