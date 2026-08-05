<template>
  <div style="font-family: sans-serif; padding: 16px">
    <h2>FixedNuxtErrorBoundary demo</h2>
    <p>Trigger different error types and watch how the boundary reacts.</p>

    <div style="display: flex; gap: 8px; margin-bottom: 16px">
      <button @click="setupError = true">
        Throw in setup() (supported)
      </button>
      <button @click="clickError = true">
        Throw from click handler (unsupported)
      </button>
      <button @click="reset">
        Reset demo
      </button>
    </div>

    <FixedNuxtErrorBoundary
      :capture-exception="captureException"
      :toast-error="toastError"
      :debug="true"
    >
      <template #error="{ error, clearError }">
        <div style="border: 2px solid #d33; padding: 12px">
          <strong>Error boundary caught:</strong> {{ error.message }}
          <div>
            <button
              @click="() => {
                setupError = false
                clearError()
              }"
            >
              Clear error
            </button>
          </div>
        </div>
      </template>
      <div style="border: 2px solid #2a2; padding: 12px">
        Page content is alive.
        <ThrowingChild v-if="setupError" />
        <ClickThrowChild v-if="clickError" />
      </div>
    </FixedNuxtErrorBoundary>

    <h3>Log</h3>
    <ul>
      <li v-for="(l, i) in log" :key="i">
        {{ l }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, ref } from "vue"
import FixedNuxtErrorBoundary from "../../src/components/FixedNuxtErrorBoundary.vue"

const setupError = ref(false)
const clickError = ref(false)
const log = ref<string[]>([])

const ThrowingChild = defineComponent({
  name: "ThrowingChild",
  setup() {
    throw new Error("Thrown from setup()")
  }
})

const ClickThrowChild = defineComponent({
  name: "ClickThrowChild",
  setup() {
    return () =>
      h("button", {
        onClick: () => {
          throw new Error("Thrown from click handler")
        }
      }, "trigger click error")
  }
})

function captureException(err: Error) {
  log.value.unshift(`captureException: ${err.message}`)
}
function toastError(message: string) {
  log.value.unshift(`toast: ${message}`)
}
function reset() {
  setupError.value = false
  clickError.value = false
  log.value = []
}
</script>
