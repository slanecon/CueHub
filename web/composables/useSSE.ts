import { onUnmounted } from 'vue'
import { useCuesStore } from '../stores/cues'
import { useUiStore } from '../stores/ui'
import type { SSEEvent } from '../../shared/types'

export function useSSE() {
  const cuesStore = useCuesStore()
  const uiStore = useUiStore()

  function handleEvent(event: SSEEvent) {
    switch (event.type) {
      case 'created':
      case 'updated':
      case 'deleted':
        cuesStore.fetchCues()
        break
      case 'editing-start':
        if (event.cueId && event.userName && event.originClientId) {
          uiStore.editorsMap[event.cueId] = { userName: event.userName, clientId: event.originClientId }
        }
        break
      case 'editing-stop':
        if (event.cueId) delete uiStore.editorsMap[event.cueId]
        break
      case 'connection-status':
        if (event.mode) uiStore.connectionMode = event.mode
        break
    }
  }

  // Browser: standard EventSource
  let es: EventSource | null = null
  if (!window.NATIVE_API_BASE) {
    es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try { handleEvent(JSON.parse(e.data)) } catch {}
    }
  }

  // Desktop: Swift calls window._nativeSSEHandler which fires this event
  function onNativeSSE(e: Event) {
    handleEvent((e as CustomEvent<SSEEvent>).detail)
  }
  window.addEventListener('native-sse', onNativeSSE)

  onUnmounted(() => {
    es?.close()
    window.removeEventListener('native-sse', onNativeSSE)
  })
}