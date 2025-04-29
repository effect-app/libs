<script setup lang="ts">
import { provideIntl } from "@effect-app/vue-components"

provideIntl({} as any)
</script>

<template>
  <slot />
</template>
