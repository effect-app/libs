<script setup lang="ts">
import { provideIntl } from "../src/utils"

const mockUseIntl = () => ({}) as any

provideIntl(mockUseIntl)
</script>

<template>
  <slot />
</template>
