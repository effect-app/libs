<script setup lang="ts">
import { provideIntl } from "../src/utils"

provideIntl({} as any)
</script>

<template>
  <slot />
</template>
