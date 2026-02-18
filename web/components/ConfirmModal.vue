<template>
  <div v-if="uiStore.showConfirm" class="modal-overlay">
    <div class="modal">
      <h3>Confirm Delete</h3>
      <!-- TODO: implement -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '../stores/ui'
const uiStore = useUiStore()
</script>