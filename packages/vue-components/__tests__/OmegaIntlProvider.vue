<script setup lang="ts">
import { provideIntl } from "../src/utils"

const mockUseIntl = () =>
  ({ trans: (k: string) => `${k}_translated`, formatMessage: (k: string) => `${k}_formatted` }) as any

provideIntl(mockUseIntl)
</script>

<template>
  <slot />
</template>
