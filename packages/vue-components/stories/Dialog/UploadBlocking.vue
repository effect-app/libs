<template>
  <div class="pa-4">
    <h2 class="text-h5 mb-4">
      Upload Progress Blocking
    </h2>
    <p class="mb-4">
      Demonstrates <code>injectBus()</code> and <code>evt.prevent = true</code> to conditionally block based on operation state.
    </p>

    <v-btn @click="open = true">
      Open Dialog
    </v-btn>

    <Dialog v-model="open">
      <template #default="{ cancel }">
        <v-card
          min-width="400"
          max-width="600"
        >
          <v-card-title>
            Upload Files
          </v-card-title>
          <v-card-text>
            <UploadBlockingContent />
          </v-card-text>
          <v-card-actions>
            <v-btn
              variant="text"
              @click="cancel"
            >
              Cancel
            </v-btn>
          </v-card-actions>
        </v-card>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import Dialog from "../../src/components/Dialog.vue"
import UploadBlockingContent from "./UploadBlockingContent.vue"

const open = ref(false)
</script>
