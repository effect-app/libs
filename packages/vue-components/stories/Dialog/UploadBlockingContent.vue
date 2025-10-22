<template>
  <div>
    <p class="mb-4 text-caption">
      Upload in progress: <strong>{{ uploadInProgress }}</strong>
    </p>
    <p class="mb-4">
      Click "Start Upload" to simulate a file upload. Try to close while uploading - you'll get a confirmation asking if
      you want to cancel the upload.
    </p>

    <v-text-field
      v-model="fileName"
      label="File Name"
      variant="outlined"
      :disabled="uploadInProgress"
    />

    <v-btn
      class="mt-2"
      :disabled="uploadInProgress"
      @click="startUpload"
    >
      {{ uploadInProgress ? `Uploading... ${uploadProgress}%` : "Start Upload" }}
    </v-btn>

    <v-progress-linear
      v-if="uploadInProgress"
      :model-value="uploadProgress"
      class="mt-4"
      color="primary"
      height="20"
    >
      <template #default="{ value }">
        <strong>{{ Math.ceil(value) }}%</strong>
      </template>
    </v-progress-linear>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { type DialogClosing, injectBus } from "../../src/components/OmegaForm/blockDialog"
import { onMountedWithCleanup } from "../../src/components/OmegaForm/onMountedWithCleanup"

const fileName = ref("document.pdf")
const uploadInProgress = ref(false)
const uploadProgress = ref(0)
let uploadInterval: ReturnType<typeof setInterval> | null = null

const bus = injectBus()

const cancelUpload = () => {
  if (uploadInterval) {
    clearInterval(uploadInterval)
    uploadInterval = null
  }
  uploadInProgress.value = false
  uploadProgress.value = 0
}

const completeUpload = () => {
  if (uploadInterval) {
    clearInterval(uploadInterval)
    uploadInterval = null
  }
  uploadInProgress.value = false
  uploadProgress.value = 0
}

if (bus) {
  onMountedWithCleanup(() => {
    const handler = (evt: DialogClosing) => {
      if (uploadInProgress.value) {
        const confirmed = confirm(
          "File upload is in progress. Closing will cancel the upload. Continue?"
        )
        if (!confirmed) {
          evt.prevent = true
        } else {
          // Cancel the upload
          cancelUpload()
        }
      }
    }

    bus.on("dialog-closing", handler)
    return () => {
      bus.off("dialog-closing", handler)
      cancelUpload()
    }
  })
}

const startUpload = () => {
  uploadInProgress.value = true
  uploadProgress.value = 0

  uploadInterval = setInterval(() => {
    uploadProgress.value += 10
    if (uploadProgress.value >= 100) {
      completeUpload()
    }
  }, 500)
}
</script>
