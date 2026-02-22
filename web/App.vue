<template>
  <AppToolbar />
  <div id="table-wrap">
    <CueTable />
  </div>
  <div id="status-bar">
    <span id="status-text">{{ statusText }}</span>
  </div>
  <CueFormModal />
  <ConfirmModal />
  <NameModal />
  <ConflictModal />
  <AppToast />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useCuesStore } from './stores/cues'
import { useUiStore } from './stores/ui'
import { useNativeBridge } from './composables/useNativeBridge'
import { useSSE } from './composables/useSSE'
import AppToolbar from './components/AppToolbar.vue'
import CueTable from './components/CueTable.vue'
import CueFormModal from './components/CueFormModal.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import NameModal from './components/NameModal.vue'
import ConflictModal from './components/ConflictModal.vue'
import AppToast from './components/AppToast.vue'

const cuesStore = useCuesStore()
const uiStore = useUiStore()

useNativeBridge()
useSSE()

const statusText = computed(() => {
  const sel = uiStore.selectedIds.size
  const total = cuesStore.cues.length
  return `${sel} of ${total} selected`
})

onMounted(async () => {
  uiStore.showNameModal()
})
</script>
