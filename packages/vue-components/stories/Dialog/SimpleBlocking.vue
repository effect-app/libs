<template>
  <div class="pa-4">
    <h2 class="text-h5 mb-4">
      Simple Sync Blocking
    </h2>
    <p class="mb-4">
      Demonstrates <code>usePreventClose()</code> - the simplest way to block dialog closing with a native confirm.
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
            Edit User
          </v-card-title>
          <v-card-text>
            <SimpleBlockingContent />
          </v-card-text>
          <v-card-actions>
            <v-btn
              variant="text"
              @click="() => {
                console.log('cancel')
                cancel()
              }"
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
import SimpleBlockingContent from "./SimpleBlockingContent.vue"

const open = ref(false)
</script>
