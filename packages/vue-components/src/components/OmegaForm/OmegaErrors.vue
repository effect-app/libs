<template>
  <Transition>
    <div
      v-if="
        formSubmissionAttempts > 0 &&
        (errors.length || showedGeneralErrors.length)
      "
      class="error-alert"
    >
      <slot v-bind="{ errors, showedGeneralErrors }">
        <v-alert
          type="error"
          variant="tonal"
          role="alert"
          aria-live="polite"
          class="mb-4"
        >
          <div class="text-h6 mb-3">{{ trans("form.includes_error") }}:</div>
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
              <div class="font-weight-medium">{{ error.label }}</div>
              <div class="error-message">
                <component
                  :is="error.errors.length > 1 ? 'ul' : 'div'"
                  class="error-list"
                >
                  <component
                    :is="error.errors.length > 1 ? 'li' : 'span'"
                    v-for="e in error.errors"
                    :key="e"
                  >
                    {{ e }}
                  </component>
                </component>
              </div>
              <a :href="`#${error.inputId}`" class="error-link">
                <v-icon :icon="mdiLink" />
                {{ trans("form.fix_input") }}
              </a>
            </component>
          </component>
          <span v-else>
            {{ showedGeneralErrors[0] }}
          </span>
        </v-alert>
      </slot>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useOmegaErrors } from "./OmegaErrorsContext"
import { mdiLink } from "@mdi/js"
import { useIntl } from "../../utils"
import type { StandardSchemaV1Issue } from "@tanstack/vue-form"
import { computed } from "vue"

const { errors, formSubmissionAttempts, generalErrors } = useOmegaErrors()

const { trans } = useIntl()

const showedGeneralErrors = computed(() => {
  if (!generalErrors.value) return []

  return generalErrors.value
    .filter((record): record is Record<string, StandardSchemaV1Issue[]> =>
      Boolean(record),
    )
    .flatMap(errorRecord =>
      Object.values(errorRecord)
        .filter((issues): issues is StandardSchemaV1Issue[] => Boolean(issues))
        .flatMap(issues =>
          issues
            .filter(
              (issue): issue is StandardSchemaV1Issue & { message: string } =>
                Boolean(issue?.message),
            )
            .map(issue => issue.message),
        ),
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
  container-type: inline-size;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: start;
}

@container (max-width: 28.125rem) {
  .error-list {
    grid-template-columns: auto 1fr;
  }

  .error-link {
    grid-column: 1 / -1;
    justify-self: end;
    padding-bottom: 16px;
  }
}

@container (max-width: 18.75rem) {
  .error-list {
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
  color: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
</style>
