<template>
  <div class="cool">I'm so <span class="super">{{ cool }}</span> {{ test }}</div>
</template>
<style scoped>
.super {
  color: aqua;
}
</style>
<script setup lang="ts">
import "./style.css"
import { ref, defineProps } from "vue"
const cool = ref("COOL")

defineProps<{ test: string }>()
</script>