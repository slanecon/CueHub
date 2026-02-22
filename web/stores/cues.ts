import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cue } from '../../shared/types'

export const useCuesStore = defineStore('cues', () => {
  const cues = ref<Cue[]>([])

  async function fetchCues() {
    const res = await fetch('/api/cues')
    cues.value = await res.json()
  }

  return { cues, fetchCues }
})