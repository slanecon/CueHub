<template>
  <div v-if="uiStore.toastMessage" class="toast show">{{ uiStore.toastMessage }}</div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useUiStore } from '../stores/ui'

const uiStore = useUiStore()

watch(() => uiStore.toastMessage, (msg) => {
  if (msg) setTimeout(() => { uiStore.toastMessage = null }, 3500)
})
</script>