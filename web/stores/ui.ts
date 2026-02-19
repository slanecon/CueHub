import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import type { Cue, EditorEntry, ConnectionMode } from '../../shared/types'

export const useUiStore = defineStore('ui', () => {
  const userName = ref<string | null>(sessionStorage.getItem('userName') ?? localStorage.getItem('userName'))
  const clientId = ref(Math.random().toString(36).substring(2, 11))
  const connectionMode = ref<ConnectionMode>('offline')

  const selectedIds = reactive(new Set<string>())
  const editingCueId = ref<string | null>(null)
  const editingBaseCue = ref<Cue | null>(null)
  const editorsMap = reactive<Record<string, EditorEntry>>({})

  // Modal visibility flags
  const showCueForm = ref(false)
  const showConfirm = ref(false)
  const showName = ref(false)
  const showConflict = ref(false)

  const toastMessage = ref<string | null>(null)

  function showNameModal() {
    if (!userName.value) showName.value = true
  }

  function setUserName(name: string) {
    userName.value = name
    sessionStorage.setItem('userName', name)
    localStorage.setItem('userName', name)
    showName.value = false
  }

  return {
    userName, clientId, connectionMode,
    selectedIds, editingCueId, editingBaseCue, editorsMap,
    showCueForm, showConfirm, showName, showConflict,
    toastMessage,
    showNameModal, setUserName,
  }
})