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
          <div class="container">
            <svg
              v-if="!vuetified"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M16 2H8L2 8V16L8 22H16L22 16V8L16 2Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 8V12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 16.0195V16"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <div>
              <div class="text-h6">
                {{ trans("form.includes_error") }}:
              </div>
              <ul
                v-if="errors.length"
                class="error-list"
              >
                <li
                  v-for="error in errors"
                  :key="error.inputId"
                  class="error-item"
                >
                  <div>
                    <label
                      :for="error.inputId"
                      class="error-link"
                    >{{ error.label }}</label>
                    {{ " " }}
                    <div
                      v-if="!hideErrorDetails"
                      class="error-message"
                      :class="error.errors.length < 2 && 'single-error'"
                    >
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
                  </div>
                </li>
              </ul>
              <span v-else>
                {{ showedGeneralErrors[0] }}
              </span>
            </div>
          </div>
        </component>
      </slot>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { StandardSchemaV1Issue } from "@tanstack/vue-form"
import { computed, getCurrentInstance } from "vue"
import { useIntl } from "../../utils"
import { type OmegaError } from "./OmegaFormStuff"

const instance = getCurrentInstance()
const vuetified = false ?? instance?.appContext.components["VAlert"]

const props = defineProps<
  {
    generalErrors: (Record<string, StandardSchemaV1Issue[]> | undefined)[]
    errors: OmegaError[]
    hideErrorDetails?: boolean
  }
>()

const { trans } = useIntl()

const showedGeneralErrors = computed(() => {
  if (!props.generalErrors) return []

  return props
    .generalErrors
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

  ::marker {
    margin: 0;
    padding: 0;
  }
}

.error-alert-content {
  background-color: var(--error-background, #fff5f5);
  color: var(--error-color, #c92a2a);
  padding: 1em;
}

.error-link {
  font-weight: bold;
  position: relative;
  color: var(--error-color, #c92a2a);
  cursor: pointer;
  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: rgba(from var(--error-color, #c92a2a) r g b / 0.5);
  }
}

.text-h6 {
  font-weight: bold;
  font-size: 1.25em;
}

.error-message {
  font-style: italic;
}

.error-item {
  margin-bottom: 0.5em;
  overflow: hidden;

  > div {
    float: right;
    width: 100%;
    max-width: calc(100% - 1.5em);
  }
}

.container {
  display: flex;
  gap: 1.5em;

  svg {
    width: 3em;
  }
  .single-error {
    display: inline-block;
  }
}
</style>
