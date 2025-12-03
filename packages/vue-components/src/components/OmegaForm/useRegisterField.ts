import { injectCertain } from "@effect-app/vue"
import { type ComputedRef, type InjectionKey, onUnmounted, provide, watch } from "vue"

const Key = Symbol("injected") as InjectionKey<Map<string, { label: string; id: string }>>

export const useRegisterField = (field: ComputedRef<{ name: string; label: string; id: string }>) => {
  const map = injectCertain(Key)
  watch(field, (f) => {
    map.set(f.name, { label: f.label, id: f.id })
  }, { immediate: true })
  onUnmounted(() => map.delete(field.value.name)) // todo; perhap only when owned
}

export const provideRegisterField = () => {
  const map = new Map<string, { label: string; id: string }>()
  provide(Key, map)
}
