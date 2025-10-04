<template>
  <Transition>
    <div
      v-if="errors.length || showedGeneralErrors.length"
      class="error-alert"
    >
      <slot v-bind="{ errors, showedGeneralErrors }">
        <component
          :is="vuetified ? 'v-alert' : 'div'"
          :class="vuetified ? 'mb-4' : 'error-alert-content'"
          type="error"
          variant="tonal"
          role="alert"
          aria-live="polite"
          class="mb-4"
        >
          <div class="text-h6 mb-3">
            {{ trans("form.includes_error") }}:
          </div>
          <component
            :is="errors.length > 1 ? 'ul' : 'div'"
            v-if="errors.length"
            class="error-list"
          >
            <component
              :is="errors.length > 1 ? 'li' : 'div'"
              v-for="error in errors"
              :key="error.inputId"
              class="error-item"
            >
              <div class="font-weight-medium">
                {{ error.label }}
              </div>
              <div class="error-message">
                <component
                  :is="error.errors.length > 1 ? 'ul' : 'div'"
                  class="error-list"
                >
                  <component
                    :is="error.errors.length > 1
                    ? 'li'
                    : 'span'"
                    v-for="e in error.errors"
                    :key="e"
                  >
                    {{ e }}
                  </component>
                </component>
              </div>
              <a
                :href="`#${error.inputId}`"
                class="error-link"
              >
                <component
                  :is="vuetified ? 'v-icon' : 'i'"
                  :icon="mdiLink"
                  aria-hidden="true"
                >
                  <i>&#128279;</i>
                </component>
                {{ trans("form.fix_input") }}
              </a>
            </component>
          </component>
          <span v-else>
            {{ showedGeneralErrors[0] }}
          </span>
        </component>
      </slot>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { mdiLink } from "@mdi/js"
import type { StandardSchemaV1Issue } from "@tanstack/vue-form"
import { Array as Array$, Option } from "effect-app"
import { computed, getCurrentInstance } from "vue"
import { useIntl } from "../../utils"
import { type OmegaError, type OmegaFormApi } from "./OmegaFormStuff"

const instance = getCurrentInstance()
const vuetified = instance?.appContext.components["VAlert"]

const props = defineProps<
  {
    form: OmegaFormApi<any, any>
    fieldMap: Map<string, { id: string; label: string }>
  }
>()

const generalErrors = props.form.useStore((state) => state.errors)
const fieldMeta = props.form.useStore((state) => state.fieldMeta)
const errors = computed(() =>
  Array$.filterMap(
    Object
      .entries(fieldMeta.value),
    ([key, m]): Option.Option<OmegaError> =>
      ((m as any).errors ?? []).length && props.fieldMap.get(key)?.id
        ? Option.some({
          label: props.fieldMap.get(key)!.label,
          inputId: props.fieldMap.get(key)!.id,
          errors: ((m as any).errors ?? []).map((e: any) => e.message).filter(Boolean)
        })
        : Option.none()
  )
)

const { trans } = useIntl()

const showedGeneralErrors = computed(() => {
  if (!generalErrors.value) return []

  return generalErrors
    .value
    .filter((record): record is Record<string, StandardSchemaV1Issue[]> => Boolean(record))
    .flatMap((errorRecord) =>
      Object
        .values(errorRecord)
        .filter((issues): issues is StandardSchemaV1Issue[] => Boolean(issues))
        .flatMap((issues) =>
          issues
            .filter(
              (issue): issue is StandardSchemaV1Issue & { message: string } => Boolean(issue?.message)
            )
            .map((issue) => issue.message)
        )
    )
})
</script>

<style scoped>
.v-enter-from,
.v-leave-to {
  max-height: 0px;
  grid-template-rows: 0fr;
  opacity: 0;
}

.v-enter-active,
.v-leave-active {
  display: grid;
  transition: all 0.15s;
}

.v-enter-to,
.v-leave-from {
  grid-template-rows: 1fr;
  max-height: 50vh;
  opacity: 1;
}

.error-alert {
  transition-behavior: allow-discrete;
  display: grid;
  overflow: hidden;
  min-height: 0;

  > * {
    min-height: 0;
  }
}

.error-list {
  list-style-position: inside;
}

div.error-list {
  container-type: inline-size;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1.5em;
  align-items: start;
}

@container (max-width: 27.125rem) {
  div.error-list {
    grid-template-columns: auto 1fr;
  }

  .error-link {
    grid-column: 1 / -1;
    justify-self: end;
  }
}

@container (max-width: 17.75rem) {
  div.error-list {
    grid-template-columns: 1fr;
  }

  .error-message {
    grid-column: 1 / -1;
  }
}

.error-item {
  display: contents;
}

a {
  min-width: min-content;
}

.error-link {
  align-items: center;
  color: inherit;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25em;
  padding-bottom: 1em;
  text-decoration: none;
}
</style>
