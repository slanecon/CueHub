<template>
  <div id="toolbar">
    <div class="toolbar-left">
      <button type="button" class="toolbar-btn" title="Add cue">+</button>
      <button type="button" class="toolbar-btn" title="Duplicate cue">&#8225;</button>
      <button type="button" class="toolbar-btn" title="Edit cue">&#x2215;</button>
      <button type="button" class="toolbar-btn" title="Delete cue">&times;</button>
    </div>
    <div class="toolbar-right">
      <div class="conn-dot" :class="connClass" :title="connTitle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'

const uiStore = useUiStore()

const connClass = computed(() => ({
  'conn-online': uiStore.connectionMode === 'online',
  'conn-offline': uiStore.connectionMode === 'offline',
  'conn-syncing': uiStore.connectionMode === 'syncing',
}))

const connTitle = computed(() => uiStore.connectionMode)
</script>