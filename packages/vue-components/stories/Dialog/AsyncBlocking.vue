<template>
  <div class="pa-4">
    <h2 class="text-h5 mb-4">
      Async Blocking with Custom Modal
    </h2>
    <p class="mb-4">
      Demonstrates <code>injectBus()</code> and <code>evt.prevent = Promise&lt;boolean&gt;</code> to use a custom modal
      instead of native confirm.
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
            Create Project
          </v-card-title>
          <v-card-text>
            <AsyncBlockingContent />
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
import AsyncBlockingContent from "./AsyncBlockingContent.vue"

const open = ref(false)
</script>
