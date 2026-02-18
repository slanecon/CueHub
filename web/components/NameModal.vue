<template>
  <div v-if="uiStore.showName" class="modal-overlay">
    <div class="modal">
      <h3>Welcome</h3>
      <p>Enter your name so other users can see who's editing.</p>
      <form @submit.prevent="submit">
        <div class="form-group">
          <label for="user-name-input">Your Name</label>
          <input v-model="name" type="text" id="user-name-input" required autofocus maxlength="30">
        </div>
        <div class="modal-actions">
          <button type="submit">Continue</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useCuesStore } from '../stores/cues'

const uiStore = useUiStore()
const cuesStore = useCuesStore()
const name = ref('')

async function submit() {
  if (!name.value.trim()) return
  uiStore.setUserName(name.value.trim())
  await Promise.all([cuesStore.fetchCues(), cuesStore.fetchCharacters()])
}

// If name already set on mount, fetch data immediately
watch(() => uiStore.showName, (show) => {
  if (!show && uiStore.userName) {
    Promise.all([cuesStore.fetchCues(), cuesStore.fetchCharacters()])
  }
}, { immediate: true })
</script>