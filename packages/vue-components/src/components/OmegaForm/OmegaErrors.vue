<template>
  <OmegaErrorsInternal v-bind="errors" />
</template>
<script setup lang="ts">
import { useOmegaErrors } from "./OmegaErrorsContext"

const errors = useOmegaErrors()
</script>
