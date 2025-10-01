/* eslint-disable @typescript-eslint/no-unsafe-function-type */

import { onMounted, onUnmounted } from "vue"

/**
 * A convenience wrapper for onMounted and onUnmounted, the returned Function of the callback,
 * will be ran on unmount.
 * @param cb Function to run on unmount
 */
export function onMountedWithCleanup(cb: () => Function | void) {
  let cleanup: Function | undefined = undefined
  onMounted(() => {
    const cleanup_ = cb()
    if (cleanup_) {
      cleanup = cleanup_
    }
  })

  onUnmounted(() => {
    if (cleanup) cleanup()
  })
}
