<template>
  <div v-if="uiStore.showConflict" class="modal-overlay">
    <div class="modal conflict-modal">
      <h3>Edit Conflict</h3>
      <!-- TODO: implement 3-way merge UI -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '../stores/ui'
const uiStore = useUiStore()
</script>