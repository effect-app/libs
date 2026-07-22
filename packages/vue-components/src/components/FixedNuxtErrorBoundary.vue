<script setup lang="ts">
import { CauseException } from "effect-app/client"
import * as Cause from "effect/Cause"
import { onErrorCaptured, shallowRef } from "vue"
import { useRouter } from "vue-router"

// withDefaults, NOT `props.enabled ?? true`: Vue's boolean casting resolves an
// ABSENT boolean prop to `false`, so the `??` fallback would never fire and an
// omitted `enabled` (the frontend case) would silently disable the boundary.
const props = withDefaults(
  defineProps<{
    captureException: (err: Error, hint?: { extra?: Record<string, unknown> }) => void
    toastError: (message: string) => void
    debug: boolean
    /** register the boundary only when true (backend passes import.meta.client; frontend omits → true) */
    enabled?: boolean
    /** defer handling until app ready (backend: onNuxtReady while hydrating; frontend: omit → run now) */
    scheduleAfterReady?: (fn: () => void) => void
    /** extra side-effect after emit, before error.value is set (backend: nuxtApp vue:error hook) */
    onHandled?: (err: Error, instance: unknown, info: string) => void
  }>(),
  { enabled: true }
)

defineOptions({ name: "NuxtErrorBoundary", inheritAttrs: false })

const emit = defineEmits<{ error: [error: Error] }>()

defineSlots<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(props: { error: Error; clearError: () => void }): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default(): any
}>()

const error = shallowRef<Error | null>(null)
function clearError() {
  error.value = null
}

// lol in production these are different...
const supportedErrors = ["https://vuejs.org/error-reference/#runtime-0", 0, "0", "setup function"]

function handleError(...args: Parameters<Parameters<typeof onErrorCaptured<Error>>[0]>) {
  const [err, instance, info] = args
  const fiberFailure = err instanceof CauseException ? err : null
  // PRO: log that we hit the error boundary
  console.warn(
    "NuxtErrorBoundary caught error in " + info + ": " + (fiberFailure ? "CauseException" : "classic error"),
    fiberFailure ? Cause.pretty(fiberFailure.originalCause) : err,
    instance
  )

  // PRO: we don't handle native event handlers the same way we handle setup errors,
  // because these errors should only get reported, not take over the page.
  if (!supportedErrors.includes(info)) {
    props.captureException(err, { extra: { info, instance } })
    if (props.debug) {
      props.toastError("An unexpected error has occurred: " + err.toString())
    }
    return
  }

  // PRO: don't render interruptions..
  // e.g when we run useSuspenseQuery, and we navigate away before a query is finished, we get a CancelledError
  // if we however render it here instead of the default slot, we will show the cancellation error of the previous page, instead of rendering the new page
  if (fiberFailure && Cause.hasInterruptsOnly(fiberFailure.originalCause)) {
    return
  }

  emit("error", err)
  props.onHandled?.(err, instance, info)
  error.value = err
}

if (props.enabled) {
  onErrorCaptured((err, instance, info) => {
    if (props.scheduleAfterReady) props.scheduleAfterReady(() => handleError(err, instance, info))
    else handleError(err, instance, info)
    return false
  })
}

// PRO: fix error not clearing after route change: https://github.com/nuxt/nuxt/issues/15781#issuecomment-2320928163
const router = useRouter()
router.afterEach(() => {
  clearError()
})

defineExpose({ error, clearError })
</script>

<template>
  <slot
    v-if="error"
    v-bind="{ error, clearError }"
    name="error"
  />

  <slot
    v-else
    name="default"
  />
</template>
