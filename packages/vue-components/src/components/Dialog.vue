<template>
  <v-dialog
    v-model="open"
    persistent
    @click:outside="onCancel"
  >
    <template #default="{ isActive }">
      <slot
        :open="open"
        :cancel="onCancel"
        :is-active="isActive"
      />
    </template>
    <!-- pass down slots -->
    <!-- @vue-skip -->
    <template
      v-for="(_, name) in otherSlots"
      #[name]="slotData"
    >
      <slot
        :name="name"
        v-bind="slotData"
      />
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue"
import { useOnClose } from "./OmegaForm/blockDialog"
import { onMountedWithCleanup } from "./OmegaForm/onMountedWithCleanup"

const props = defineProps<{
  persistent?: boolean
}>()

const open = defineModel<boolean>({ default: false })

const slots = useSlots()
const otherSlots = computed(() => {
  const { default: _, ...rest } = slots
  return rest
})

const onCancel = useOnClose(() => {
  return open.value = false
})

onMountedWithCleanup(() => {
  const onEscape = (e: KeyboardEvent) => {
    if (open.value && !props.persistent && e.code === "Escape") {
      onCancel()
    }
  }

  document.addEventListener("keydown", onEscape)
  return () => document.removeEventListener("keydown", onEscape)
})
</script>
