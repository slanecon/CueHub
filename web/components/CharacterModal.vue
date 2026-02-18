<template>
  <div v-if="uiStore.showCharacter" class="modal-overlay">
    <div class="modal">
      <h3>Add Character</h3>
      <!-- TODO: implement form -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '../stores/ui'
const uiStore = useUiStore()
</script>