import { useStore } from "@tanstack/vue-form"
import { computed, type Ref } from "vue"
import type { OmegaFormApi, OmegaFormState } from "./OmegaFormStuff"

export function getOmegaStore<
  To,
  From,
  K extends keyof OmegaFormState<To, From> = keyof OmegaFormState<To, From>
>(
  form: OmegaFormApi<To, From>,
  subscribe?: K[]
): Ref<
  K[] extends undefined[] ? Record<string, never>
    : Pick<OmegaFormState<To, From>, K>
> {
  return computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!subscribe) return {} as any

    const state = useStore(form.store, (state) => {
      const result = {} as Pick<OmegaFormState<To, From>, K>
      for (const key of subscribe) {
        result[key] = state[key]
      }
      return result
    })

    return state.value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any // Type assertion needed due to Vue's computed typing limitations
}
