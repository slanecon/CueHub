<template>
  <div v-if="uiStore.showCueForm" class="modal-overlay">
    <div class="modal modal-wide">
      <h3>Add Cue</h3>
      <!-- TODO: implement form -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '../stores/ui'
const uiStore = useUiStore()
</script>