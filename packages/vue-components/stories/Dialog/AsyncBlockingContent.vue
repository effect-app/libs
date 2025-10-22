<template>
  <div>
    <p class="mb-4 text-caption">
      Blocking enabled: <strong>{{ shouldBlock }}</strong>
    </p>
    <p class="mb-4">
      Toggle the switch and try to close. You'll see a custom modal with Allow/Prevent options.
    </p>

    <v-switch
      v-model="shouldBlock"
      label="Enable blocking"
      color="primary"
    />

    <p class="mt-4 text-body-2">
      This uses <code>evt.prevent = Promise&lt;boolean&gt;</code> for async blocking with a custom modal.
    </p>

    <!-- Custom Confirmation Modal -->
    <v-dialog
      v-model="showConfirm"
      max-width="400"
      persistent
    >
      <v-card>
        <v-card-title class="bg-warning">
          Confirm Close
        </v-card-title>
        <v-card-text class="pt-4">
          The blocking is enabled. What would you like to do?
        </v-card-text>
        <v-card-actions>
          <v-btn
            variant="text"
            @click="handlePrevent"
          >
            Prevent (Stay)
          </v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            @click="handleAllow"
          >
            Allow (Close)
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { type DialogClosing, injectBus } from "../../src/components/OmegaForm/blockDialog"
import { onMountedWithCleanup } from "../../src/components/OmegaForm/onMountedWithCleanup"

const shouldBlock = ref(false)
const showConfirm = ref(false)
let confirmResolver: ((allow: boolean) => void) | null = null

const bus = injectBus()

if (bus) {
  onMountedWithCleanup(() => {
    const handler = (evt: DialogClosing) => {
      if (shouldBlock.value) {
        evt.prevent = new Promise((resolve) => {
          confirmResolver = resolve
          showConfirm.value = true
        })
      }
    }

    bus.on("dialog-closing", handler)
    return () => bus.off("dialog-closing", handler)
  })
}

const handlePrevent = () => {
  showConfirm.value = false
  confirmResolver?.(false) // Prevent close
  confirmResolver = null
}

const handleAllow = () => {
  showConfirm.value = false
  confirmResolver?.(true) // Allow close
  confirmResolver = null
}
</script>
