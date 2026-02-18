import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cue, Character } from '../../shared/types'

export const useCuesStore = defineStore('cues', () => {
  const cues = ref<Cue[]>([])
  const characters = ref<Character[]>([])

  async function fetchCues() {
    const res = await fetch('/api/cues')
    cues.value = await res.json()
  }

  async function fetchCharacters() {
    const res = await fetch('/api/characters')
    characters.value = await res.json()
  }

  return { cues, characters, fetchCues, fetchCharacters }
})