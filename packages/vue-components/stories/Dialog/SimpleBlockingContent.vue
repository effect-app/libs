<template>
  <div>
    <p class="mb-4 text-caption">
      Blocking enabled: <strong>{{ shouldBlock }}</strong>
    </p>
    <p class="mb-4">
      Toggle the switch and try to close. When enabled, you'll see: "Es sind ungespeicherte Änderungen vorhanden.
      Wirklich schließen?"
    </p>

    <v-switch
      v-model="shouldBlock"
      label="Enable blocking"
      color="primary"
    />

    <p class="mt-4 text-body-2">
      This uses <code>usePreventClose(() => shouldBlock)</code> to sync block the dialog.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { usePreventClose } from "../../src/components/OmegaForm/blockDialog"

const shouldBlock = ref(false)

usePreventClose(() => shouldBlock)
</script>
