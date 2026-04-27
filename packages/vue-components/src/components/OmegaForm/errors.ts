/* eslint-disable @typescript-eslint/no-explicit-any */

import { type Component, computed, type ComputedRef, type ConcreteComponent, h, onUnmounted, type Ref, ref, watch } from "vue"
import { useIntl } from "../../utils"
import type { OmegaError } from "./types"
import type { OF } from "./useOmegaForm"

export const useErrorLabel = (form: OF<any, any>) => {
  const { formatMessage } = useIntl()
  const humanize = (str: string) => {
    return str
      .replace(/([A-Z])/g, " $1") // Add space before capital letters
      .replace(/^./, (char) => char.toUpperCase()) // Capitalize the first letter
      .trim() // Remove leading/trailing spaces
  }
  const fallback = (propsName: string) =>
    formatMessage
      ? formatMessage({ id: `general.fields.${propsName}`, defaultMessage: humanize(propsName) })
      : humanize(propsName)
  const i18n = (propsName: string) =>
    form.i18nNamespace
      ? formatMessage({ id: `${form.i18nNamespace}.fields.${propsName}`, defaultMessage: fallback(propsName) })
      : fallback(propsName)

  return i18n
}

export const eHoc = (errorProps: {
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
        const errorMap = form.useStore((state) => state.errorMap)

        const errorLabel = useErrorLabel(form)

        const errors = computed(() => {
          // Collect errors from fieldMeta (field-level errors for registered fields)
          const fieldErrors = Object.entries(fieldMeta.value).reduce<OmegaError[]>((acc, [key, m]) => {
            const fieldErrors = (m as { errors?: Array<{ message?: string }> } | undefined)?.errors ?? []
            if (!fieldErrors.length) {
              return acc
            }

            const fieldInfo = fieldMap.value.get(key)
            if (!fieldInfo) {
              return acc
            }

            acc.push({
              label: fieldInfo.label,
              inputId: fieldInfo.id,
              errors: [fieldErrors[0]?.message].filter(Boolean) as string[]
            })

            return acc
          }, [])

          // Collect errors from errorMap.onDynamic / errorMap.onSubmit ONLY for fields that are NOT registered
          // (registered fields already have their errors in fieldMeta).
          // Our localized standard schema writes to onDynamic via validationLogic: revalidateLogic();
          // caller-provided validators.onSubmit (via tanstackFormOptions spread) writes to onSubmit.
          const submitErrors: OmegaError[] = []
          const submitIssueMaps = [errorMap.value.onDynamic, errorMap.value.onSubmit].filter(Boolean) as Array<
            Record<string, unknown>
          >
          const seenPaths = new Set<string>()
          for (const issuesByPath of submitIssueMaps) {
            for (const [_, issues] of Object.entries(issuesByPath)) {
              if (Array.isArray(issues) && issues.length) {
                for (const issue of issues) {
                  const issAny: any = issue
                  if (issAny?.path && Array.isArray(issAny.path) && issAny.path.length) {
                    const fieldPath = issAny.path.join(".")
                    if (!fieldMap.value.has(fieldPath) && !seenPaths.has(fieldPath)) {
                      seenPaths.add(fieldPath)
                      submitErrors.push({
                        label: errorLabel(fieldPath),
                        inputId: fieldPath,
                        errors: [issAny.message].filter(Boolean)
                      })
                      break
                    }
                  }
                }
              }
            }
          }

          // Combine both error sources (no need to check for duplicates since they're mutually exclusive)
          return [...fieldErrors, ...submitErrors]
        })

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

export const makeFieldMap = () => {
  const fieldMap = ref(new Map<string, { label: string; id: string }>())
  const registerField = (field: ComputedRef<{ name: string; label: string; id: string }>) => {
    watch(field, (f) => {
      fieldMap.value.set(f.name, { label: f.label, id: f.id })
    }, { immediate: true })
    onUnmounted(() => {
      // Only delete if we still own this entry (id matches)
      // This prevents old components from deleting entries registered by new components
      // during re-mount transitions (e.g., when :key changes)
      const currentEntry = fieldMap.value.get(field.value.name)
      if (currentEntry?.id === field.value.id) {
        fieldMap.value.delete(field.value.name)
      }
    })
  }
  return { fieldMap, registerField }
}
